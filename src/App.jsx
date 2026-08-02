import React, { useState, useEffect, useRef } from 'react';
import { Send, Bell, BellOff, Calendar, Check, Trash2, Bot, User, Settings, Plus, Sparkles } from 'lucide-react';

export default function App() {
  const [messages, setMessages] = useState([
    { id: 1, sender: 'assistant', text: "Hello! I am your AI Reminder assistant. Tell me what you need to remember. For example: 'Remind me to call Mom in 5 minutes' or 'Schedule a meeting tomorrow at 3 PM.'" }
  ]);
  const [input, setInput] = useState('');
  const [reminders, setReminders] = useState([]);
  const [pushStatus, setPushStatus] = useState('prompt'); // prompt, granted, denied
  const [showSettings, setShowSettings] = useState(false);
  const [geminiKey, setGeminiKey] = useState(localStorage.getItem('gemini_api_key') || '');
  const chatEndRef = useRef(null);

  // Load reminders and chat messages from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('reminders');
    if (saved) {
      setReminders(JSON.parse(saved));
    }
    const savedMessages = localStorage.getItem('chat_messages');
    if (savedMessages) {
      setMessages(JSON.parse(savedMessages));
    }
    
    // Check Notification API permission
    if ('Notification' in window) {
      setPushStatus(Notification.permission);
    }
  }, []);

  // Periodic scanner to check for due reminders (robust, survives reloads)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      let updatedAny = false;
      const updatedReminders = reminders.map(r => {
        if (!r.completed && !r.notified && new Date(r.time) <= now) {
          // Play alarm sound
          new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-120.wav').play().catch(() => {});
          
          // Trigger notification
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Task Due!', {
              body: r.title,
              requireInteraction: true
            });
          }
          
          updatedAny = true;
          return { ...r, notified: true };
        }
        return r;
      });

      if (updatedAny) {
        saveReminders(updatedReminders);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [reminders]);

  // Save reminders to localStorage
  const saveReminders = (newReminders) => {
    setReminders(newReminders);
    localStorage.setItem('reminders', JSON.stringify(newReminders));
  };

  // Save chat messages to localStorage
  const saveMessages = (newMessages) => {
    setMessages(newMessages);
    localStorage.setItem('chat_messages', JSON.stringify(newMessages));
  };

  // Clear chat history
  const clearChatHistory = () => {
    const defaultMsg = [{ id: 1, sender: 'assistant', text: "Hello! I am your AI Reminder assistant. Tell me what you need to remember." }];
    saveMessages(defaultMsg);
  };

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Request notifications permission
  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      alert('This browser does not support push notifications.');
      return;
    }
    const permission = await Notification.requestPermission();
    setPushStatus(permission);
    if (permission === 'granted') {
      registerServiceWorker();
    }
  };

  const registerServiceWorker = async () => {
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        console.log('Service Worker registered successfully:', reg);
      } catch (err) {
        console.error('Service Worker registration failed:', err);
      }
    }
  };

  // Run a client-side NLP parser if the API call is unavailable or fails
  const parseLocalReminder = (text) => {
    const lower = text.toLowerCase();
    let title = "Scheduled task";
    let date = new Date();
    let matched = false;

    const inMinMatch = lower.match(/(?:remind me to|remember to)\s+(.+?)\s+in\s+(\d+)\s+minute/i);
    if (inMinMatch) {
      title = inMinMatch[1];
      const minutes = parseInt(inMinMatch[2], 10);
      date.setMinutes(date.getMinutes() + minutes);
      matched = true;
    }

    const atTimeMatch = lower.match(/(?:remind me to|remember to)\s+(.+?)\s+at\s+(\d+)(?::(\d+))?\s*(pm|am)/i);
    if (atTimeMatch && !matched) {
      title = atTimeMatch[1];
      let hours = parseInt(atTimeMatch[2], 10);
      const minutes = atTimeMatch[3] ? parseInt(atTimeMatch[3], 10) : 0;
      const ampm = atTimeMatch[4].toLowerCase();
      
      if (ampm === 'pm' && hours < 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;
      
      date.setHours(hours, minutes, 0, 0);
      if (date.getTime() < Date.now()) {
        date.setDate(date.getDate() + 1);
      }
      matched = true;
    }

    if (matched) {
      return {
        title: title.charAt(0).toUpperCase() + title.slice(1),
        time: date.toISOString()
      };
    }
    return null;
  };

  // Add multiple reminders at once
  const createRemindersBatch = (newItems) => {
    setReminders(prev => {
      const updated = [
        ...prev,
        ...newItems.map(item => ({
          id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          title: item.title,
          time: item.time,
          completed: false,
          notified: false,
          createdAt: new Date().toISOString()
        }))
      ].sort((a, b) => new Date(a.time) - new Date(b.time));
      localStorage.setItem('reminders', JSON.stringify(updated));
      return updated;
    });
  };

  // Add single reminder
  const createReminder = (title, time) => {
    createRemindersBatch([{ title, time }]);
  };

  // Send message handle
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = { id: Date.now(), sender: 'user', text: input };
    const updatedMessages = [...messages, userMessage];
    saveMessages(updatedMessages);
    const currentInput = input;
    setInput('');

    // Loader message
    const botLoaderId = Date.now() + 1;
    setMessages(prev => [...prev, { id: botLoaderId, sender: 'assistant', text: "Analyzing your request..." }]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': geminiKey ? `Bearer ${geminiKey}` : ''
        },
        body: JSON.stringify({ message: currentInput })
      });

      if (response.ok) {
        const data = await response.json();
        const finalMessages = updatedMessages.concat({
          id: Date.now(),
          sender: 'assistant',
          text: data.text
        });
        saveMessages(finalMessages);

        if (data.reminders && Array.isArray(data.reminders) && data.reminders.length > 0) {
          createRemindersBatch(data.reminders);
        }
      } else {
        throw new Error('API server unavailable');
      }
    } catch (err) {
      setTimeout(() => {
        const parsed = parseLocalReminder(currentInput);
        let botText = "I parsed your message, but couldn't detect a specific time. Try saying: 'Remind me to drink water in 10 minutes'.";
        
        if (parsed) {
          createReminder(parsed.title, parsed.time);
          botText = `Got it! I scheduled a reminder: "${parsed.title}" for ${new Date(parsed.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;
        }

        const finalMessages = updatedMessages.concat({
          id: Date.now(),
          sender: 'assistant',
          text: botText
        });
        saveMessages(finalMessages);
      }, 800);
    }
  };

  const deleteReminder = (id) => {
    saveReminders(reminders.filter(r => r.id !== id));
  };

  const toggleComplete = (id) => {
    saveReminders(reminders.map(r => r.id === id ? { ...r, completed: !r.completed } : r));
  };

  const handleSaveSettings = (e) => {
    e.preventDefault();
    localStorage.setItem('gemini_api_key', geminiKey);
    setShowSettings(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header>
        <div className="brand">
          <Sparkles size={24} color="#a855f7" />
          <h1>RemindAI</h1>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            className="settings-trigger" 
            onClick={() => requestNotificationPermission()}
          >
            {pushStatus === 'granted' ? <Bell size={18} color="#10b981" /> : <BellOff size={18} />}
            {pushStatus === 'granted' ? 'Alerts On' : 'Enable Alerts'}
          </button>
          <button 
            className="settings-trigger"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings size={18} />
            Config
          </button>
        </div>
      </header>

      <main className="app-container">
        {/* Left Side: Conversational Chat */}
        <section className="glass-panel chat-section">
          <div className="chat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Bot size={20} color="#6366f1" />
              <div>
                <h3>AI Assistant</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#9ca3af' }}>
                  <span className="status-dot"></span> Online
                </div>
              </div>
            </div>
            <button 
              className="settings-trigger" 
              style={{ padding: '6px 12px', fontSize: '0.75rem' }}
              onClick={clearChatHistory}
            >
              Clear Chat
            </button>
          </div>

          <div className="chat-history">
            {messages.map(msg => (
              <div key={msg.id} className={`chat-message ${msg.sender}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', fontSize: '0.75rem', opacity: 0.8 }}>
                  {msg.sender === 'assistant' ? <Bot size={12} /> : <User size={12} />}
                  <span>{msg.sender === 'assistant' ? 'System' : 'You'}</span>
                </div>
                <div>{msg.text}</div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <form className="chat-input-area" onSubmit={handleSendMessage}>
            <input
              type="text"
              className="chat-input"
              placeholder="E.g., Remind me to review plans in 10 minutes..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button type="submit" className="chat-send-btn">
              <Send size={18} />
            </button>
          </form>
        </section>

        {/* Right Side: Reminders Panel */}
        <section className="dashboard-section">
          {/* Active Tasks */}
          <div className="glass-panel" style={{ padding: '20px', flex: 1 }}>
            <h2 className="section-title">
              <Calendar size={18} color="#6366f1" />
              Upcoming Reminders
            </h2>
            <div className="reminder-list">
              {reminders.filter(r => !r.completed).length === 0 ? (
                <div style={{ color: '#9ca3af', textAlign: 'center', padding: '40px 0', fontSize: '0.9rem' }}>
                  No upcoming reminders. Set one using the chat!
                </div>
              ) : (
                reminders.filter(r => !r.completed).map(r => (
                  <div key={r.id} className="reminder-card">
                    <div className="reminder-info">
                      <div className="reminder-title">{r.title}</div>
                      <div className="reminder-time">
                        <Bell size={12} />
                        {new Date(r.time).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </div>
                    </div>
                    <div className="reminder-actions">
                      <button 
                        className="action-btn complete"
                        onClick={() => toggleComplete(r.id)}
                        title="Mark Complete"
                      >
                        <Check size={16} />
                      </button>
                      <button 
                        className="action-btn delete"
                        onClick={() => deleteReminder(r.id)}
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Completed Tasks */}
          <div className="glass-panel" style={{ padding: '20px', maxHeight: '200px', overflowY: 'auto' }}>
            <h3 className="section-title" style={{ fontSize: '1rem', color: '#9ca3af' }}>
              Completed
            </h3>
            <div className="reminder-list">
              {reminders.filter(r => r.completed).map(r => (
                <div key={r.id} className="reminder-card" style={{ opacity: 0.6 }}>
                  <div className="reminder-info">
                    <div className="reminder-title" style={{ textDecoration: 'line-through' }}>{r.title}</div>
                  </div>
                  <div className="reminder-actions">
                    <button 
                      className="action-btn complete"
                      onClick={() => toggleComplete(r.id)}
                    >
                      <Check size={16} />
                    </button>
                    <button 
                      className="action-btn delete"
                      onClick={() => deleteReminder(r.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'grid', placeContent: 'center', zIndex: 100
        }}>
          <div className="glass-panel" style={{ padding: '30px', width: '400px', background: '#0e131f' }}>
            <h3 style={{ marginBottom: '16px' }}>AI Configuration</h3>
            <form onSubmit={handleSaveSettings}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#9ca3af', marginBottom: '6px' }}>
                  Gemini API Key (stored locally)
                </label>
                <input
                  type="password"
                  className="chat-input"
                  style={{ width: '100%' }}
                  placeholder="Paste AI API Key here..."
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button 
                  type="button" 
                  className="settings-trigger" 
                  onClick={() => setShowSettings(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="settings-trigger"
                  style={{ background: 'var(--color-primary)', border: 'none', color: '#fff' }}
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
