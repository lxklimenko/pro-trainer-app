import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  ChevronLeft,
  Plus,
  Trash2,
  UserPlus,
  Calendar,
  ClipboardList,
  Check,
  X,
  Search,
  Copy,
  Trophy,
  Clock,
  Share2,
  Timer,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Volume2,
  BrainCircuit,
  Loader2
} from "lucide-react";

/**
 * КОНФИГУРАЦИЯ ИИ (GEMINI)
 * API ключ подставляется автоматически средой выполнения.
 */
const apiKey = "";
const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025";
const TTS_MODEL = "gemini-2.5-flash-preview-tts";

const STORAGE_KEY = "trainer_pro_data_v5";

// Вспомогательная функция для генерации уникальных ID без использования внешних библиотек
const generateId = () => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

/**
 * ФУНКЦИИ ВЗАИМОДЕЙСТВИЯ С GEMINI API
 */

// Вызов текстовой модели для генерации плана и анализа
async function callGemini(prompt, systemInstruction = "") {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: systemInstruction }] }
  };

  let delay = 1000;
  for (let i = 0; i < 5; i++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error("API limit or error");
      const result = await response.json();
      return result.candidates?.[0]?.content?.parts?.[0]?.text || "Ошибка генерации";
    } catch (e) {
      if (i === 4) throw e;
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
}

// Вызов TTS модели для озвучки текста
async function textToSpeech(text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: `Зачитай четко: ${text}` }] }],
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
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);

    const sampleRate = 24000;
    const wavHeader = new ArrayBuffer(44);
    const view = new DataView(wavHeader);
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + bytes.length, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, bytes.length, true);

    const blob = new Blob([wavHeader, bytes], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  } catch (e) {
    return null;
  }
}

/**
 * КОМПОНЕНТ МОДАЛЬНОГО ОКНА
 */
const Modal = ({ isOpen, title, children, onClose, onConfirm, confirmText = "Ок", isDanger = false, isLoading = false }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-sm rounded-2xl p-6 shadow-2xl text-zinc-100">
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
            className={`px-4 py-2 rounded-xl font-medium transition-colors flex items-center gap-2 ${isDanger ? "bg-red-500 hover:bg-red-600 text-white" : "bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"}`}
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
 * ГЛАВНОЕ ПРИЛОЖЕНИЕ
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

  // Автосохранение в LocalStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clients));
  }, [clients]);

  // Логика таймера
  useEffect(() => {
    if (timeLeft > 0) {
      timerRef.current = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
    } else {
      clearTimeout(timerRef.current);
    }
    return () => clearTimeout(timerRef.current);
  }, [timeLeft]);

  const startTimer = (seconds) => setTimeLeft(seconds);

  // --- AI ЛОГИКА ---
  const handleAiPlanGenerate = async () => {
    if (!inputValue.trim()) return;
    setIsAiLoading(true);
    try {
      const prompt = `Составь структуру тренировки на основе запроса: "${inputValue}". Верни только сам текст тренировки (упражнения, подходы).`;
      const system = "Ты профессиональный фитнес-тренер.";
      const plan = await callGemini(prompt, system);
      updateClientInfo(view.clientId, { plan: plan });
      setModal({ type: null });
    } catch (e) {
      console.error(e);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleAiAnalysis = async () => {
    setIsAiLoading(true);
    setModal({ type: 'aiAnalysis' });
    try {
      const client = clients.find(c => c.id === view.clientId);
      const historyText = client.workouts.map(w => `${w.date} - ${w.title}: ${w.content}`).join("\n---\n");
      const prompt = `Проанализируй историю тренировок клиента: \n${historyText}\n\nДай краткое резюме прогресса (2-3 предложения) и рекомендацию.`;
      const analysis = await callGemini(prompt, "Ты эксперт по спортивному анализу.");
      setAiResponse(analysis);
    } catch (e) {
      setAiResponse("Ошибка анализа.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleTts = async (text) => {
    if (isAiLoading || !text) return;
    setIsAiLoading(true);
    const audioUrl = await textToSpeech(text);
    if (audioUrl && audioRef.current) {
      audioRef.current.src = audioUrl;
      audioRef.current.play();
    }
    setIsAiLoading(false);
  };

  // --- ОБРАБОТЧИКИ ДАННЫХ ---
  const addClient = () => {
    if (!inputValue.trim()) return;
    setClients([...clients, { id: generateId(), name: inputValue, goal: "", goalDate: "", plan: "", workouts: [] }]);
    setInputValue("");
    setModal({ type: null });
  };

  const updateClientInfo = (id, fields) => {
    setClients(clients.map(c => c.id === id ? { ...c, ...fields } : c));
  };

  const addWorkout = (clientId) => {
    if (!inputValue.trim()) return;
    const client = clients.find(c => c.id === clientId);
    const newWorkout = {
      id: generateId(),
      title: inputValue,
      date: new Date().toLocaleDateString('ru-RU'),
      content: client.plan || ""
    };
    setClients(clients.map(c => c.id === clientId ? { ...c, workouts: [newWorkout, ...c.workouts] } : c));
    setInputValue("");
    setModal({ type: null });
  };

  const deleteWorkout = (clientId, workoutId) => {
    setClients(clients.map(c => {
      if (c.id === clientId) {
        return { ...c, workouts: c.workouts.filter(w => w.id !== workoutId) };
      }
      return c;
    }));
    setModal({ type: null });
  };

  const shareWorkout = (content) => {
    navigator.clipboard.writeText(content).catch(() => {
      const textArea = document.createElement("textarea");
      textArea.value = content;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    });
  };

  const filteredClients = useMemo(() =>
    clients.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [clients, searchQuery]
  );

  const currentClient = clients.find(c => c.id === view.clientId);
  const currentWorkout = currentClient?.workouts.find(w => w.id === view.workoutId);

  // --- ЭКРАНЫ РЕНДЕРИНГА ---

  // 1. Главный экран (Список клиентов)
  if (view.type === 'home') {
    return (
      <div className="min-h-screen bg-black text-zinc-100 p-6 font-sans">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Клиенты</h1>
            <p className="text-zinc-500 text-sm mt-1">Всего: {clients.length}</p>
          </div>
          <button
            onClick={() => { setModal({ type: 'addClient' }); setInputValue(""); }}
            className="p-3 bg-indigo-600 rounded-full shadow-lg shadow-indigo-500/20 active:scale-95 transition-all"
          >
            <UserPlus size={24} />
          </button>
        </header>

        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
          <input
            type="text"
            placeholder="Поиск..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl py-3 pl-12 pr-4 focus:outline-none focus:border-zinc-600 transition-all"
          />
        </div>

        <div className="grid gap-4">
          {filteredClients.map(client => (
            <button
              key={client.id}
              onClick={() => setView({ type: 'client', clientId: client.id })}
              className="w-full text-left p-5 bg-zinc-900 border border-zinc-800 rounded-2xl flex justify-between items-center group active:scale-[0.98] transition-all"
            >
              <div>
                <div className="font-bold text-lg group-hover:text-indigo-400 transition-colors">{client.name}</div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider">{client.workouts.length} тренировок</div>
              </div>
              <ChevronLeft size={20} className="rotate-180 text-zinc-600" />
            </button>
          ))}
        </div>

        <Modal isOpen={modal.type === 'addClient'} title="Новый клиент" onClose={() => setModal({ type: null })} onConfirm={addClient} confirmText="Создать">
          <input autoFocus className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none" placeholder="Имя Фамилия" value={inputValue} onChange={e => setInputValue(e.target.value)} />
        </Modal>
      </div>
    );
  }

  // 2. Экран клиента
  if (view.type === 'client' && currentClient) {
    return (
      <div className="min-h-screen bg-black text-zinc-100 p-6">
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button onClick={() => setView({ type: 'home' })} className="p-2 hover:bg-zinc-900 rounded-lg transition-colors"><ChevronLeft size={28} /></button>
            <h1 className="text-2xl font-bold truncate max-w-[200px]">{currentClient.name}</h1>
          </div>
        </header>

        {/* Секция Шаблона Плана */}
        <section className="mb-8 overflow-hidden bg-zinc-900/20 border border-zinc-800 rounded-2xl p-1 shadow-sm">
          <div className="flex items-center justify-between p-3">
            <button
              onClick={() => setShowPlan(!showPlan)}
              className="flex items-center gap-2 text-zinc-400 text-[10px] font-bold uppercase tracking-widest"
            >
              <ClipboardList size={14} />
              <span>Базовый план</span>
              {showPlan ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            <button
              onClick={() => { setModal({ type: 'aiPlan' }); setInputValue(""); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-900/30 text-indigo-400 rounded-full text-[10px] font-black hover:bg-indigo-900/50 transition-all border border-indigo-500/20"
            >
              <Sparkles size={12} />
              ✨ ИИ ПЛАН
            </button>
          </div>

          {showPlan && (
            <textarea
              className="w-full h-32 bg-transparent p-4 text-zinc-300 focus:outline-none transition-all resize-none leading-relaxed text-sm"
              placeholder="Опишите план или используйте ИИ..."
              value={currentClient.plan}
              onChange={e => updateClientInfo(currentClient.id, { plan: e.target.value })}
            />
          )}
        </section>

        <section>
          <div className="flex justify-between items-center mb-4 px-2">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold flex items-center gap-2 text-zinc-500"><Calendar size={20} /> История</h2>
              {currentClient.workouts.length > 0 && (
                <button
                  onClick={handleAiAnalysis}
                  className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 bg-zinc-800/50 px-2 py-1 rounded-lg border border-zinc-700 hover:text-indigo-400"
                >
                  <BrainCircuit size={12} />
                  ✨ АНАЛИЗ
                </button>
              )}
            </div>
            <button onClick={() => { setModal({ type: 'addWorkout' }); setInputValue(new Date().toLocaleDateString('ru-RU')); }} className="flex items-center gap-1 text-sm font-bold text-indigo-400"><Plus size={18} /> Добавить</button>
          </div>
          <div className="grid gap-3">
            {currentClient.workouts.map(workout => (
              <div key={workout.id} className="flex items-center gap-2">
                <button
                  onClick={() => setView({ type: 'workout', clientId: currentClient.id, workoutId: workout.id })}
                  className="flex-1 flex justify-between items-center p-5 bg-zinc-900/50 border border-zinc-800 rounded-2xl hover:bg-zinc-800 transition-colors"
                >
                  <span className="font-semibold text-left">{workout.title}</span>
                  <span className="text-[10px] text-zinc-600 font-mono">{workout.date}</span>
                </button>
                <button
                  onClick={() => setModal({ type: 'confirmDeleteWorkout', data: workout.id })}
                  className="p-3 text-zinc-700 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Модалки для этого экрана */}
        <Modal isOpen={modal.type === 'aiPlan'} title="✨ О чем тренировка?" onClose={() => setModal({ type: null })} onConfirm={handleAiPlanGenerate} confirmText="Создать" isLoading={isAiLoading}>
          <textarea autoFocus className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none h-24 text-sm" placeholder="Напр: Силовая на ноги, акцент на присед" value={inputValue} onChange={e => setInputValue(e.target.value)} />
        </Modal>

        <Modal isOpen={modal.type === 'aiAnalysis'} title="✨ ИИ Анализ" onClose={() => { setModal({ type: null }); setAiResponse(""); }} onConfirm={() => { setModal({ type: null }); setAiResponse(""); }} confirmText="Ок" isLoading={isAiLoading}>
          <div className="text-sm text-zinc-300 italic">{aiResponse || "Готовлю отчет..."}</div>
        </Modal>

        <Modal isOpen={modal.type === 'addWorkout'} title="Заголовок тренировки" onClose={() => setModal({ type: null })} onConfirm={() => addWorkout(currentClient.id)} confirmText="Создать">
          <input autoFocus className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none" value={inputValue} onChange={e => setInputValue(e.target.value)} />
        </Modal>

        <Modal isOpen={modal.type === 'confirmDeleteWorkout'} title="Удалить запись?" isDanger onClose={() => setModal({ type: null })} onConfirm={() => deleteWorkout(currentClient.id, modal.data)} confirmText="Удалить">
          <p className="text-zinc-400 text-sm">Данные будут стерты безвозвратно.</p>
        </Modal>
      </div>
    );
  }

  // 3. Экран выполнения тренировки
  if (view.type === 'workout' && currentWorkout) {
    return (
      <div className="min-h-screen bg-black text-zinc-100 p-6 flex flex-col">
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button onClick={() => setView({ type: 'client', clientId: currentClient.id })} className="p-2 hover:bg-zinc-900 rounded-lg"><ChevronLeft size={28} /></button>
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate">{currentWorkout.title}</h1>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest">{currentClient.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleTts(currentWorkout.content)}
              className={`p-3 bg-zinc-900 border border-zinc-800 rounded-full text-zinc-400 hover:text-white transition-all ${isAiLoading ? 'animate-pulse' : ''}`}
            >
              <Volume2 size={20} />
            </button>
            <button onClick={() => shareWorkout(currentWorkout.content)} className="p-3 bg-zinc-900 border border-zinc-800 rounded-full text-indigo-400 active:bg-indigo-600 active:text-white transition-all"><Share2 size={20} /></button>
          </div>
        </header>

        <div className="flex items-center gap-3 mb-6 bg-zinc-900/50 p-4 rounded-3xl border border-zinc-800/50 shadow-inner">
          <Timer size={20} className={timeLeft > 0 ? "text-orange-500 animate-pulse" : "text-zinc-600"} />
          <div className="flex-1 font-mono text-2xl font-bold tracking-tighter">
            {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
          </div>
          <div className="flex gap-2">
            {[60, 90].map(s => (
              <button key={s} onClick={() => startTimer(s)} className="px-3 py-1.5 bg-zinc-800 rounded-xl text-xs font-bold border border-zinc-700 hover:border-indigo-500">
                {s}с
              </button>
            ))}
            {timeLeft > 0 && <button onClick={() => setTimeLeft(0)} className="px-3 py-1.5 bg-red-900/30 text-red-400 rounded-xl text-xs font-bold uppercase">Stop</button>}
          </div>
        </div>

        <textarea
          autoFocus
          className="flex-1 w-full bg-zinc-900/20 border border-zinc-800 rounded-3xl p-6 text-lg text-zinc-200 focus:outline-none focus:border-indigo-500 transition-all resize-none shadow-2xl leading-relaxed"
          placeholder="Опишите упражнения..."
          value={currentWorkout.content}
          onChange={e => {
            setClients(clients.map(c => c.id === currentClient.id ? {
              ...c,
              workouts: c.workouts.map(w => w.id === currentWorkout.id ? { ...w, content: e.target.value } : w)
            } : c));
          }}
        />

        <audio ref={audioRef} hidden />

        <footer className="mt-4 flex justify-center py-2">
           <button onClick={() => setView({ type: 'client', clientId: currentClient.id })} className="flex items-center gap-2 px-12 py-4 bg-indigo-600 rounded-full font-bold text-white shadow-lg active:scale-95 transition-all"><Check size={20} /> Сохранить</button>
        </footer>
      </div>
    );
  }

  return null;
}