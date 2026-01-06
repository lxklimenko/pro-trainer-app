import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  ChevronLeft, Plus, Trash2, UserPlus, Calendar, ClipboardList,
  Check, X, Search, Copy, Trophy, Clock, Share2, Timer,
  ChevronDown, ChevronUp, Sparkles, Volume2, BrainCircuit, Loader2
} from "lucide-react";

/**
 * КОНФИГУРАЦИЯ ИИ (GEMINI)
 * Ключ берется из переменных окружения Vercel или файла .env
 */
const apiKey = import.meta.env.VITE_GEMINI_KEY || "";
const GEMINI_MODEL = "gemini-1.5-flash"; // Стабильная быстрая модель
const TTS_MODEL = "gemini-1.5-flash-8b"; // Для озвучки используем легкую модель

const STORAGE_KEY = "trainer_pro_data_v5";

// Генерация ID
const generateId = () => Math.random().toString(36).substring(2, 15);

/**
 * API ФУНКЦИИ
 */
async function callGemini(prompt, systemInstruction = "") {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: systemInstruction }] }
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    return result.candidates?.[0]?.content?.parts?.[0]?.text || "Ошибка генерации";
  } catch (e) {
    return "Не удалось связаться с ИИ. Проверьте ключ.";
  }
}

async function textToSpeech(text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: `Зачитай: ${text}` }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } } }
    }
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    const pcmData = result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!pcmData) return null;
    const binaryString = atob(pcmData);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  } catch (e) { return null; }
}

/**
 * КОМПОНЕНТЫ UI
 */
const Modal = ({ isOpen, title, children, onClose, onConfirm, confirmText = "Ок", isDanger = false, isLoading = false }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-sm rounded-3xl p-6 shadow-2xl text-zinc-100">
        <h3 className="text-xl font-bold mb-4">{title}</h3>
        <div className="mb-6">{children}</div>
        <div className="flex gap-3 justify-end">
          {!isLoading && (
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-zinc-400 hover:bg-zinc-800 transition-colors">
              Отмена
            </button>
          )}
          <button
            disabled={isLoading}
            onClick={onConfirm}
            className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 ${isDanger ? "bg-red-500 text-white" : "bg-indigo-600 text-white disabled:opacity-50"}`}
          >
            {isLoading && <Loader2 className="animate-spin" size={18} />}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * ОСНОВНОЕ ПРИЛОЖЕНИЕ
 */
export default function App() {
  const [clients, setClients] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  const [view, setView] = useState({ type: 'home', clientId: null, workoutId: null });
  const [modal, setModal] = useState({ type: null, data: null });
  const [inputValue, setInputValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showPlan, setShowPlan] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);

  const timerRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clients));
  }, [clients]);

  useEffect(() => {
    if (timeLeft > 0) {
      timerRef.current = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
    } else {
      clearTimeout(timerRef.current);
    }
    return () => clearTimeout(timerRef.current);
  }, [timeLeft]);

  const updateClientInfo = (id, fields) => {
    setClients(clients.map(c => c.id === id ? { ...c, ...fields } : c));
  };

  const currentClient = clients.find(c => c.id === view.clientId);
  const currentWorkout = currentClient?.workouts.find(w => w.id === view.workoutId);

  // --- ЭКРАН 1: СПИСОК КЛИЕНТОВ ---
  if (view.type === 'home') {
    return (
      <div className="min-h-screen bg-black text-zinc-100 p-6">
        <header className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-black italic uppercase tracking-tighter">Trainer Pro</h1>
          <button onClick={() => { setModal({ type: 'addClient' }); setInputValue(""); }} className="p-4 bg-indigo-600 rounded-full shadow-lg shadow-indigo-500/30"><UserPlus size={24} /></button>
        </header>

        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
          <input type="text" placeholder="Поиск атлета..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:ring-2 ring-indigo-500/20" />
        </div>

        <div className="grid gap-3">
          {clients.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase())).map(client => (
            <button key={client.id} onClick={() => setView({ type: 'client', clientId: client.id })} className="w-full text-left p-5 bg-zinc-900/50 border border-zinc-800 rounded-3xl flex justify-between items-center hover:bg-zinc-800/50 transition-all">
              <div>
                <div className="font-bold text-lg">{client.name}</div>
                <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">{client.workouts.length} сессий</div>
              </div>
              <ChevronLeft size={20} className="rotate-180 text-zinc-700" />
            </button>
          ))}
        </div>

        <Modal isOpen={modal.type === 'addClient'} title="Новый атлет" onClose={() => setModal({ type: null })} onConfirm={() => {
          if (!inputValue.trim()) return;
          setClients([...clients, { id: generateId(), name: inputValue, plan: "", workouts: [] }]);
          setModal({ type: null });
        }} confirmText="Добавить">
          <input autoFocus className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white outline-none" placeholder="Имя Фамилия" value={inputValue} onChange={e => setInputValue(e.target.value)} />
        </Modal>
      </div>
    );
  }

  // --- ЭКРАН 2: КАРТОЧКА КЛИЕНТА ---
  if (view.type === 'client' && currentClient) {
    return (
      <div className="min-h-screen bg-black text-zinc-100 p-6">
        <header className="flex items-center gap-4 mb-8">
          <button onClick={() => setView({ type: 'home' })} className="p-2 bg-zinc-900 rounded-xl"><ChevronLeft size={24} /></button>
          <h1 className="text-2xl font-bold">{currentClient.name}</h1>
        </header>

        <div className="bg-zinc-900/30 border border-zinc-800 rounded-3xl p-5 mb-8">
          <div className="flex justify-between items-center mb-4">
             <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Базовая программа</span>
             <button onClick={() => { setModal({ type: 'aiPlan' }); setInputValue(""); }} className="text-[10px] bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-full border border-indigo-500/20 font-black">✨ AI ПЛАН</button>
          </div>
          <textarea
            className="w-full bg-transparent text-sm text-zinc-300 outline-none min-h-[100px] resize-none"
            placeholder="Опишите общую стратегию..."
            value={currentClient.plan}
            onChange={e => updateClientInfo(currentClient.id, { plan: e.target.value })}
          />
        </div>

        <div className="flex justify-between items-center mb-6">
          <h2 className="font-bold text-zinc-500 uppercase text-xs tracking-widest">История тренировок</h2>
          <button onClick={() => {
            const newW = { id: generateId(), title: "Тренировка", date: new Date().toLocaleDateString('ru-RU'), content: currentClient.plan };
            setClients(clients.map(c => c.id === currentClient.id ? { ...c, workouts: [newW, ...c.workouts] } : c));
          }} className="text-indigo-400 font-bold text-sm flex items-center gap-1"><Plus size={16}/> Новая</button>
        </div>

        <div className="grid gap-3">
          {currentClient.workouts.map(w => (
            <div key={w.id} className="flex gap-2">
              <button onClick={() => setView({ type: 'workout', clientId: currentClient.id, workoutId: w.id })} className="flex-1 p-5 bg-zinc-900/50 border border-zinc-800 rounded-2xl flex justify-between items-center">
                <span className="font-semibold">{w.title}</span>
                <span className="text-[10px] text-zinc-600 font-mono">{w.date}</span>
              </button>
              <button onClick={() => {
                setClients(clients.map(c => c.id === currentClient.id ? { ...c, workouts: c.workouts.filter(work => work.id !== w.id) } : c));
              }} className="p-4 text-zinc-700 hover:text-red-500"><Trash2 size={20}/></button>
            </div>
          ))}
        </div>

        <Modal isOpen={modal.type === 'aiPlan'} title="✨ AI Генерация" onClose={() => setModal({ type: null })} isLoading={isAiLoading} onConfirm={async () => {
           setIsAiLoading(true);
           const res = await callGemini(`Составь план: ${inputValue}`, "Ты фитнес-тренер.");
           updateClientInfo(currentClient.id, { plan: res });
           setIsAiLoading(false);
           setModal({ type: null });
        }}>
          <textarea autoFocus className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm h-32 outline-none" placeholder="Цель: похудение, акцент на ноги..." value={inputValue} onChange={e => setInputValue(e.target.value)} />
        </Modal>
      </div>
    );
  }

  // --- ЭКРАН 3: ВЫПОЛНЕНИЕ ТРЕНИРОВКИ ---
  if (view.type === 'workout' && currentWorkout) {
    return (
      <div className="min-h-screen bg-black text-zinc-100 p-6 flex flex-col">
        <header className="flex items-center justify-between mb-6">
           <button onClick={() => setView({ type: 'client', clientId: currentClient.id })} className="p-2 bg-zinc-900 rounded-xl"><ChevronLeft size={24} /></button>
           <div className="text-center">
             <div className="font-bold">{currentWorkout.title}</div>
             <div className="text-[10px] text-zinc-500">{currentClient.name}</div>
           </div>
           <button onClick={() => {
             navigator.clipboard.writeText(currentWorkout.content);
             alert("Скопировано!");
           }} className="p-2 bg-zinc-900 rounded-xl text-indigo-400"><Share2 size={20}/></button>
        </header>

        <div className="bg-zinc-900 p-4 rounded-3xl mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Timer className={timeLeft > 0 ? "text-orange-500 animate-pulse" : "text-zinc-600"} />
            <span className="font-mono text-2xl font-bold">{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setTimeLeft(60)} className="px-3 py-1 bg-zinc-800 rounded-lg text-xs font-bold border border-zinc-700">60с</button>
            <button onClick={() => setTimeLeft(90)} className="px-3 py-1 bg-zinc-800 rounded-lg text-xs font-bold border border-zinc-700">90с</button>
            {timeLeft > 0 && <button onClick={() => setTimeLeft(0)} className="text-red-500 text-xs font-black ml-2">STOP</button>}
          </div>
        </div>

        <textarea
          autoFocus
          className="flex-1 bg-zinc-900/20 border border-zinc-800 rounded-3xl p-6 text-lg outline-none resize-none leading-relaxed"
          value={currentWorkout.content}
          onChange={e => {
            const newContent = e.target.value;
            setClients(clients.map(c => c.id === currentClient.id ? {
              ...c, workouts: c.workouts.map(w => w.id === currentWorkout.id ? { ...w, content: newContent } : w)
            } : c));
          }}
        />

        <button onClick={() => setView({ type: 'client', clientId: currentClient.id })} className="mt-4 w-full py-5 bg-indigo-600 rounded-full font-black shadow-xl shadow-indigo-500/20">СОХРАНИТЬ</button>
      </div>
    );
  }

  return null;
}