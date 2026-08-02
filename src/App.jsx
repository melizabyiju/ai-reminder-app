import React, { useState, useEffect, useRef } from 'react';
import { Send, Bell, BellOff, Calendar, Check, Trash2, Bot, Settings, Sparkles, ChevronDown, ChevronUp, X } from 'lucide-react';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent';
const GEMINI_FALLBACK_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';

const SYSTEM_PROMPT = `You are RemindAI, a reminder assistant. Today is {{CURRENT_TIME}}.

Rules:
- Accept ANY natural language, fix typos silently.
- If the user mentions a goal/event without enough details (time, date), ask ONE short follow-up question.
- Once you have enough info, break big tasks into sub-reminders across days.
- Support any future date/time for reminders.
- Keep replies short and friendly.

Always reply with ONLY this JSON (no markdown, no code fences):
{"message":"reply","reminders":[{"title":"task title","time":"ISO8601"}]}
If no reminders yet, use: {"message":"reply","reminders":[]}`;


export default function App() {
  const [messages, setMessages] = useState([]);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [input, setInput] = useState('');
  const [reminders, setReminders] = useState([]);
  const [notifStatus, setNotifStatus] = useState('prompt');
  const [showSettings, setShowSettings] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [geminiKey, setGeminiKey] = useState('');
  const [tempKey, setTempKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef(null);

  // On mount: load reminders + API key, clear chat (fresh session)
  useEffect(() => {
    const savedReminders = localStorage.getItem('reminders');
    if (savedReminders) setReminders(JSON.parse(savedReminders));

    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
      setGeminiKey(savedKey);
      setTempKey(savedKey);
    }

    if ('Notification' in window) setNotifStatus(Notification.permission);

    // Always start chat fresh each session
    setMessages([{
      id: 1,
      role: 'assistant',
      text: "Hi! I'm RemindAI 👋 Just tell me anything — like *'I have a presentation tomorrow'* or *'remind me to call Dad at 6pm'* — and I'll handle it for you."
    }]);
  }, []);

  // Scroll to bottom on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Reminder alarm scanner — every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      let changed = false;
      const updated = reminders.map(r => {
        if (!r.completed && !r.notified && new Date(r.time) <= now) {
          triggerAlert(r.title);
          changed = true;
          return { ...r, notified: true };
        }
        return r;
      });
      if (changed) saveReminders(updated);
    }, 5000);
    return () => clearInterval(interval);
  }, [reminders]);

  const triggerAlert = (title) => {
    // Sound
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.frequency.value = 880;
      oscillator.type = 'sine';
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 1);
    } catch (e) {}

    // Browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('⏰ Reminder!', {
        body: title,
        icon: '/icon.png',
        requireInteraction: true,
        tag: title
      });
    }
  };

  const saveReminders = (list) => {
    const sorted = [...list].sort((a, b) => new Date(a.time) - new Date(b.time));
    setReminders(sorted);
    localStorage.setItem('reminders', JSON.stringify(sorted));
  };

  const addReminders = (newItems) => {
    setReminders(prev => {
      const batch = newItems.map(item => ({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title: item.title,
        time: item.time,
        completed: false,
        notified: false,
        createdAt: new Date().toISOString()
      }));
      const merged = [...prev, ...batch].sort((a, b) => new Date(a.time) - new Date(b.time));
      localStorage.setItem('reminders', JSON.stringify(merged));
      return merged;
    });
  };

  const requestNotifications = async () => {
    if (!('Notification' in window)) {
      alert('Your browser does not support notifications.');
      return;
    }
    const perm = await Notification.requestPermission();
    setNotifStatus(perm);
    if (perm === 'granted' && 'serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/sw.js');
      } catch (e) {
        console.warn('SW failed:', e);
      }
    }
  };

  const sleep = (ms) => new Promise(res => setTimeout(res, ms));

  const MODEL_CANDIDATES = [
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
    'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent',
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-001:generateContent',
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-002:generateContent'
  ];

  const callGemini = async (userText, retryCount = 0) => {
    localStorage.removeItem('gemini_model_name');

    const now = new Date();
    const timeStr = now.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata', hour12: true,
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    const prompt = SYSTEM_PROMPT.replace('{{CURRENT_TIME}}', timeStr);

    const recentHistory = conversationHistory.slice(-6);
    const contents = [
      { role: 'user',  parts: [{ text: prompt }] },
      { role: 'model', parts: [{ text: '{"message":"Ready!","reminders":[]}' }] },
      ...recentHistory,
      { role: 'user',  parts: [{ text: userText }] }
    ];

    let res = null;

    // Try candidate endpoints sequentially until one does not 404
    for (const baseUrl of MODEL_CANDIDATES) {
      try {
        const response = await fetch(`${baseUrl}?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            generationConfig: { temperature: 0.6, maxOutputTokens: 512 }
          })
        });

        if (response.status !== 404) {
          res = response;
          break;
        }
      } catch (e) {}
    }

    if (!res) {
      throw new Error('API_404: All Gemini model endpoints failed. Please check your API key in Config.');
    }

    // Rate limit — auto retry with live countdown ticker
    if (res.status === 429) {
      if (retryCount < 2) {
        const waitSec = (retryCount + 1) * 15;
        for (let s = waitSec; s > 0; s--) {
          setMessages(prev => {
            const msg = `⏳ Google AI rate limit reached (15 req/min). Retrying automatically in ${s}s…`;
            const hasRetry = prev.some(m => m.isRetryMsg);
            if (hasRetry) return prev.map(m => m.isRetryMsg ? { ...m, text: msg } : m);
            return [...prev, { id: 'retry', role: 'assistant', text: msg, isRetryMsg: true }];
          });
          await sleep(1000);
        }
        setMessages(prev => prev.filter(m => !m.isRetryMsg));
        return callGemini(userText, retryCount + 1);
      }
      throw new Error('RATE_LIMIT');
    }

    if (res.status === 400) throw new Error('INVALID_KEY');
    if (!res.ok) {
      let errDetail = `status ${res.status}`;
      try {
        const errBody = await res.json();
        errDetail = errBody?.error?.message || errDetail;
      } catch {}
      throw new Error(`API_${res.status}: ${errDetail}`);
    }

    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!raw) throw new Error('EMPTY_RESPONSE');

    // Strip markdown code fences if model wraps in them
    const clean = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    try {
      return JSON.parse(clean);
    } catch {
      // Fallback: extract JSON object from response
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error('PARSE_ERROR');
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    if (!geminiKey) {
      setMessages(prev => [...prev, {
        id: Date.now(),
        role: 'assistant',
        text: "⚙️ Please set your Gemini API key in **Config** first. Get one free at [Google AI Studio](https://aistudio.google.com/)."
      }]);
      setShowSettings(true);
      setInput('');
      return;
    }

    const userMsg = { id: Date.now(), role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const result = await callGemini(text);

      const assistantMsg = { id: Date.now() + 1, role: 'assistant', text: result.message };
      setMessages(prev => [...prev, assistantMsg]);

      // Update conversation history for multi-turn
      setConversationHistory(prev => [
        ...prev,
        { role: 'user', parts: [{ text }] },
        { role: 'model', parts: [{ text: JSON.stringify(result) }] }
      ]);

      if (result.reminders?.length > 0) {
        addReminders(result.reminders);
      }
    } catch (err) {
      const msg = err.message === 'RATE_LIMIT'
        ? "⏳ You've hit the free Gemini rate limit (15 requests/min). Please wait about a minute and try again."
        : err.message === 'INVALID_KEY'
        ? "🔑 Your API key looks invalid. Please go to **Config** and paste the correct key from [Google AI Studio](https://aistudio.google.com/)."
        : err.message === 'EMPTY_RESPONSE'
        ? "🤔 The AI returned an empty response. Please try rephrasing your message."
        : `❌ Something went wrong (${err.message}). Please try again.`;

      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'assistant', text: msg }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  };

  const deleteReminder = (id) => saveReminders(reminders.filter(r => r.id !== id));
  const toggleComplete = (id) => saveReminders(reminders.map(r => r.id === id ? { ...r, completed: !r.completed } : r));

  const activeReminders = reminders.filter(r => !r.completed);
  const completedReminders = reminders.filter(r => r.completed);

  const formatTime = (iso) => {
    const d = new Date(iso);
    const today = new Date();
    const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
    const isToday = d.toDateString() === today.toDateString();
    const isTomorrow = d.toDateString() === tomorrow.toDateString();
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `Today, ${timeStr}`;
    if (isTomorrow) return `Tomorrow, ${timeStr}`;
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + `, ${timeStr}`;
  };

  const isOverdue = (iso) => new Date(iso) < new Date();

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="app-header">
        <div className="brand">
          <Sparkles size={20} color="#a78bfa" />
          <span className="brand-name">RemindAI</span>
        </div>
        <div className="header-actions">
          <button
            className={`notif-btn ${notifStatus === 'granted' ? 'active' : ''}`}
            onClick={requestNotifications}
          >
            {notifStatus === 'granted'
              ? <><Bell size={16} /> Alerts On</>
              : <><BellOff size={16} /> Enable Alerts</>
            }
          </button>
          <button className="icon-btn" onClick={() => { setShowSettings(true); setTempKey(geminiKey); }}>
            <Settings size={18} />
          </button>
        </div>
      </header>

      {/* Main layout */}
      <div className="main-layout">

        {/* Left: Chat */}
        <div className="chat-panel glass">
          <div className="chat-messages" id="chat-messages">
            {messages.map(msg => (
              <div key={msg.id} className={`bubble-wrap ${msg.role}`}>
                {msg.role === 'assistant' && (
                  <div className="avatar"><Bot size={14} /></div>
                )}
                <div className={`bubble ${msg.role}`}>
                  <span dangerouslySetInnerHTML={{
                    __html: msg.text
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\*(.*?)\*/g, '<em>$1</em>')
                      .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>')
                  }} />
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="bubble-wrap assistant">
                <div className="avatar"><Bot size={14} /></div>
                <div className="bubble assistant typing">
                  <span className="dot" /><span className="dot" /><span className="dot" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form className="chat-input-row" onSubmit={handleSend}>
            <textarea
              className="chat-input"
              placeholder="Type anything… e.g. 'I have an exam next Monday'"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
            />
            <button type="submit" className="send-btn" disabled={isLoading || !input.trim()}>
              <Send size={18} />
            </button>
          </form>
        </div>

        {/* Right: Dashboard */}
        <div className="dashboard">
          {/* Active reminders */}
          <div className="glass reminder-section">
            <div className="section-header">
              <Calendar size={16} color="#818cf8" />
              <span>Upcoming ({activeReminders.length})</span>
            </div>
            <div className="reminder-list">
              {activeReminders.length === 0 ? (
                <div className="empty-state">No reminders yet. Chat to add one!</div>
              ) : (
                activeReminders.map(r => (
                  <div key={r.id} className={`reminder-card ${isOverdue(r.time) ? 'overdue' : ''}`}>
                    <div className="reminder-body">
                      <div className="reminder-title">{r.title}</div>
                      <div className={`reminder-time ${isOverdue(r.time) ? 'overdue-text' : ''}`}>
                        {isOverdue(r.time) ? '⚠️ Overdue · ' : '🕐 '}
                        {formatTime(r.time)}
                      </div>
                    </div>
                    <div className="reminder-btns">
                      <button className="r-btn done" onClick={() => toggleComplete(r.id)} title="Mark done">
                        <Check size={14} />
                      </button>
                      <button className="r-btn del" onClick={() => deleteReminder(r.id)} title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Completed reminders (collapsible) */}
          {completedReminders.length > 0 && (
            <div className="glass reminder-section">
              <button
                className="section-header collapsible"
                onClick={() => setShowCompleted(v => !v)}
              >
                <Check size={16} color="#34d399" />
                <span>Completed ({completedReminders.length})</span>
                {showCompleted ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {showCompleted && (
                <div className="reminder-list">
                  {completedReminders.map(r => (
                    <div key={r.id} className="reminder-card completed">
                      <div className="reminder-body">
                        <div className="reminder-title done-title">{r.title}</div>
                        <div className="reminder-time">{formatTime(r.time)}</div>
                      </div>
                      <div className="reminder-btns">
                        <button className="r-btn done" onClick={() => toggleComplete(r.id)} title="Undo">
                          <Check size={14} />
                        </button>
                        <button className="r-btn del" onClick={() => deleteReminder(r.id)} title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Settings modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal glass" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Configuration</h3>
              <button className="icon-btn" onClick={() => setShowSettings(false)}><X size={18} /></button>
            </div>
            <label className="modal-label">Gemini API Key</label>
            <input
              type="password"
              className="modal-input"
              placeholder="Paste your API key…"
              value={tempKey}
              onChange={e => setTempKey(e.target.value)}
            />
            <p className="modal-hint">
              Get a free key at{' '}
              <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer">
                Google AI Studio
              </a>. It is stored only in your browser.
            </p>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setShowSettings(false)}>Cancel</button>
              <button className="btn-primary" onClick={() => {
                localStorage.setItem('gemini_api_key', tempKey);
                setGeminiKey(tempKey);
                setShowSettings(false);
              }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
