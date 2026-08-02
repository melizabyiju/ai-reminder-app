import React, { useState, useEffect, useRef } from 'react';
import { Send, Bell, BellOff, Calendar, Check, Trash2, Bot, Settings, Sparkles, ChevronDown, ChevronUp, X } from 'lucide-react';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const SYSTEM_PROMPT = `You are RemindAI, a smart personal assistant that helps users manage their tasks and reminders through natural conversation.

Current date and time: {{CURRENT_TIME}}

Your behavior rules:
1. UNDERSTAND natural language freely. The user may write casually, with typos, abbreviations, or grammatical mistakes. Always interpret what they mean, never reject or ask them to reformat.
2. If the user mentions a goal or event (e.g., "I have a presentation tomorrow"), do NOT immediately create reminders. Instead, ask 1-2 short, friendly follow-up questions to understand the full context (e.g., "What time is the presentation?" or "Would you like me to schedule preparation steps for today?").
3. Once you have enough information, break goals into logical sub-tasks with sensible scheduled times across multiple days if needed.
4. Support reminders for any future date and time — today, tomorrow, next week, specific dates, etc.
5. Correct any typos or grammar in the task titles silently before saving them.
6. Be warm, brief, and conversational. Don't over-explain.

Response format — always return valid JSON:
{
  "message": "Your friendly conversational reply here",
  "reminders": [
    { "title": "Clean task title", "time": "ISO 8601 datetime string" }
  ],
  "needs_more_info": true or false
}

Rules:
- Set "reminders" to [] if you need more info or if no reminders should be created yet.
- Set "needs_more_info" to true when you asked a follow-up question.
- Set "needs_more_info" to false when reminders are being created or the reply is informational.
- Always use ISO 8601 format for times, calculated from the current date/time provided above.`;

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

  const callGemini = async (userText) => {
    const now = new Date();
    const prompt = SYSTEM_PROMPT.replace('{{CURRENT_TIME}}', now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true, dateStyle: 'full', timeStyle: 'short' }));

    const history = [
      { role: 'user', parts: [{ text: prompt }] },
      { role: 'model', parts: [{ text: '{"message": "Got it! I\'m ready to help.", "reminders": [], "needs_more_info": false}' }] },
      ...conversationHistory,
      { role: 'user', parts: [{ text: userText }] }
    ];

    const res = await fetch(`${GEMINI_API_URL}?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: history,
        generationConfig: { responseMimeType: 'application/json', temperature: 0.7 }
      })
    });

    if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return JSON.parse(raw);
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
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'assistant',
        text: `Sorry, I ran into an issue: ${err.message}. Please check your API key in Config.`
      }]);
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
