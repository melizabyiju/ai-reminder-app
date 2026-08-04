import React, { useState, useEffect, useRef } from 'react';
import { Send, Bell, BellOff, Calendar, Check, Trash2, Bot, Settings, Sparkles, ChevronDown, ChevronUp, X, Volume2, VolumeX, Upload, Play, Mic, MicOff, Plus } from 'lucide-react';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent';
const GEMINI_FALLBACK_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';

const SYSTEM_PROMPT = `You are RemindAI, a reminder assistant. Current date/time: {{CURRENT_TIME}}.

CRITICAL RULES (MUST follow every one):
1. Accept ANY natural language input. Fix typos silently.
2. **MULTIPLE REMINDERS**: If the user mentions MORE than one task/event (separated by commas, "and", "also", semicolons, or new lines), you MUST parse EACH ONE into a SEPARATE reminder object in the "reminders" array. NEVER merge them. NEVER skip any. If user says "clean my room at 10:30, change bedsheets, write records at 10:15 and 3pm" — that is 4 separate reminders.
3. **TITLES**: Use the user's EXACT words as the reminder title. Do NOT rephrase, summarize, or genericize. If user says "Reminder to meeting at 145", the title should be "Meeting" (extract the task name, strip time info). If user says "clean my room", title = "Clean my room". If user says "change bedsheets", title = "Change bedsheets".
4. **TIMES**: Parse times intelligently. "at 10 30" = 10:30, "at 3pm" = 15:00, "in 10m" = 10 minutes from now, "tomorrow" = next day 09:00. If a task has no explicit time but is grouped with timed tasks, ask a follow-up ONLY for that specific task.
5. If the user mentions a task without ANY time/date context at all, ask ONE short follow-up.
6. Keep replies short, friendly, use emoji sparingly.

OUTPUT FORMAT — respond with ONLY this JSON (no markdown, no code fences, no extra text):
{"message":"your friendly reply","reminders":[{"title":"exact task name","time":"ISO8601 datetime"}]}
If no reminders to create: {"message":"your reply","reminders":[]}

EXAMPLES:
User: "remind me to clean my room at 10:30, change my bedsheets, also to write records at 10:15 and 3pm"
Response: {"message":"Got it! I created 4 separate reminders for you: • Clean my room (Today, 10:30) • Change bedsheets (Today, 10:30) • Write records (Today, 10:15) • Write records (Today, 15:00)","reminders":[{"title":"Clean my room","time":"...T10:30:00"},{"title":"Change bedsheets","time":"...T10:30:00"},{"title":"Write records","time":"...T10:15:00"},{"title":"Write records","time":"...T15:00:00"}]}

User: "Reminder to meeting at 145"
Response: {"message":"Got it! What time would you like me to set the reminder for \\"Meeting\\"? Did you mean 1:45 PM?","reminders":[]}

User: "Meeting at 9 55"
Response: {"message":"Got it! Scheduled \\"Meeting\\" for today at 09:55.","reminders":[{"title":"Meeting","time":"...T09:55:00"}]}`;


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

  // Manual Add State
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualDate, setManualDate] = useState('');
  const [manualTime, setManualTime] = useState('');

  // Sound Settings State
  const [isMuted, setIsMuted] = useState(false);
  const [soundPreset, setSoundPreset] = useState('sine'); // 'sine', 'chime', 'marimba', 'custom'
  const [customSoundUrl, setCustomSoundUrl] = useState('');
  const [customFileName, setCustomFileName] = useState('');

  // Voice Input State
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const shouldKeepListeningRef = useRef(false);
  const baseTextRef = useRef('');
  const sessionFinalRef = useRef('');

  const toggleVoiceInput = () => {
    if (isListening) {
      shouldKeepListeningRef.current = false;
      try { recognitionRef.current?.stop(); } catch (e) {}
      setIsListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported on this browser. Please use Chrome on Android or Desktop.');
      return;
    }

    try {
      shouldKeepListeningRef.current = true;
      baseTextRef.current = input;
      sessionFinalRef.current = '';

      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

      const startRecognition = () => {
        const recognition = new SpeechRecognition();
        recognition.continuous = !isMobile;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => setIsListening(true);

        recognition.onresult = (event) => {
          let finalText = '';
          let interimText = '';

          for (let i = 0; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
              finalText += result[0].transcript;
            } else {
              interimText += result[0].transcript;
            }
          }

          if (isMobile) {
            const combined = [baseTextRef.current.trim(), sessionFinalRef.current.trim(), finalText, interimText]
              .filter(Boolean).join(' ');
            setInput(combined);

            if (finalText) {
              sessionFinalRef.current = (sessionFinalRef.current + ' ' + finalText).trim();
            }
          } else {
            const allTranscript = (finalText + interimText).trim();
            const base = baseTextRef.current.trim();
            setInput(base ? `${base} ${allTranscript}` : allTranscript);
          }
        };

        recognition.onerror = (event) => {
          console.warn('Speech recognition error:', event.error);
          if (event.error === 'no-speech' && shouldKeepListeningRef.current) {
            return;
          }
          if (event.error !== 'aborted' && event.error !== 'no-speech') {
            setIsListening(false);
            shouldKeepListeningRef.current = false;
          }
        };

        recognition.onend = () => {
          if (shouldKeepListeningRef.current) {
            try {
              if (isMobile) {
                baseTextRef.current = (baseTextRef.current.trim() + ' ' + sessionFinalRef.current.trim()).trim();
                sessionFinalRef.current = '';
              }
              startRecognition();
            } catch (e) {
              setIsListening(false);
              shouldKeepListeningRef.current = false;
            }
          } else {
            setIsListening(false);
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
      };

      startRecognition();
    } catch (e) {
      console.warn('Speech recognition init failed:', e);
      setIsListening(false);
      shouldKeepListeningRef.current = false;
    }
  };

  // Manual Add Handlers
  const openManualAddModal = () => {
    const now = new Date();
    const plus10 = new Date(now.getTime() + 10 * 60000);

    const dateStr = plus10.toISOString().split('T')[0];
    const hours = String(plus10.getHours()).padStart(2, '0');
    const mins = String(plus10.getMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${mins}`;

    setManualTitle('');
    setManualDate(dateStr);
    setManualTime(timeStr);
    setShowManualAdd(true);
  };

  const handleSaveManualReminder = (e) => {
    e.preventDefault();
    if (!manualTitle.trim()) return;

    const [year, month, day] = manualDate.split('-').map(Number);
    const [hours, minutes] = manualTime.split(':').map(Number);

    const targetDate = new Date(year, month - 1, day, hours, minutes, 0);
    const titleFormatted = manualTitle.trim().charAt(0).toUpperCase() + manualTitle.trim().slice(1);

    addReminders([{ title: titleFormatted, time: targetDate.toISOString() }]);
    setShowManualAdd(false);
  };

  const chatEndRef = useRef(null);

  // On mount: load reminders + API key + sound settings, register SW, clear chat
  useEffect(() => {
    const savedReminders = localStorage.getItem('reminders');
    if (savedReminders) setReminders(JSON.parse(savedReminders));

    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
      setGeminiKey(savedKey);
      setTempKey(savedKey);
    }

    const savedMuted = localStorage.getItem('alarm_muted');
    if (savedMuted !== null) setIsMuted(savedMuted === 'true');

    const savedPreset = localStorage.getItem('alarm_preset');
    if (savedPreset) setSoundPreset(savedPreset);

    const savedCustomUrl = localStorage.getItem('alarm_custom_url');
    if (savedCustomUrl) setCustomSoundUrl(savedCustomUrl);

    const savedCustomName = localStorage.getItem('alarm_custom_name');
    if (savedCustomName) setCustomFileName(savedCustomName);

    if ('Notification' in window) setNotifStatus(Notification.permission);

    // Auto-register service worker for background notifications
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(reg => {
        console.log('Service Worker registered for background reminders');
      }).catch(e => console.warn('SW registration failed:', e));
    }

    // Always start chat fresh each session
    setMessages([{
      id: 1,
      role: 'assistant',
      text: "Hi! I'm RemindAI 👋 Just tell me anything — like *'I have a presentation tomorrow'* or *'remind me to call Dad at 6pm'* — and I'll handle it for you."
    }]);
  }, []);

  // Sync reminders to Service Worker for background notifications
  useEffect(() => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SYNC_REMINDERS',
        reminders: reminders
      });
    }
  }, [reminders]);

  // Scroll to bottom on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Audio Playback Synth / Audio File Player / Text-to-Speech
  const playAlarmSound = (overridePreset = null, overrideCustomUrl = null, overrideTitle = null) => {
    if (isMuted && !overridePreset) return;

    const preset = overridePreset || soundPreset;
    const customUrl = overrideCustomUrl || customSoundUrl;

    // 1. Text-to-Speech Voice Announcement
    if (preset === 'speech') {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const textToSpeak = overrideTitle ? `Reminder: ${overrideTitle}` : 'Reminder: Bath';
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        window.speechSynthesis.speak(utterance);
      }
      return;
    }

    // 2. Custom Uploaded Audio File
    if (preset === 'custom' && customUrl) {
      const audio = new Audio(customUrl);
      audio.play().catch(e => console.warn('Custom audio playback failed:', e));
      return;
    }

    // 3. Web Audio Synth Presets (sine, chime, marimba)
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (preset === 'chime') {
        [659.25, 880].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = freq;
          osc.type = 'sine';
          gain.gain.setValueAtTime(0.4, ctx.currentTime + i * 0.25);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.25 + 0.8);
          osc.start(ctx.currentTime + i * 0.25);
          osc.stop(ctx.currentTime + i * 0.25 + 0.8);
        });
      } else if (preset === 'marimba') {
        [523.25, 659.25, 783.99].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = freq;
          osc.type = 'triangle';
          gain.gain.setValueAtTime(0.5, ctx.currentTime + i * 0.15);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.5);
          osc.start(ctx.currentTime + i * 0.15);
          osc.stop(ctx.currentTime + i * 0.15 + 0.5);
        });
      } else {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.5, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 1.2);
      }
    } catch (e) {}
  };

  // Custom Audio File Upload Handler
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      alert('Audio file size should be less than 8MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      setCustomSoundUrl(dataUrl);
      setCustomFileName(file.name);
      setSoundPreset('custom');
      localStorage.setItem('alarm_custom_url', dataUrl);
      localStorage.setItem('alarm_custom_name', file.name);
      localStorage.setItem('alarm_preset', 'custom');
    };
    reader.readAsDataURL(file);
  };

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
  }, [reminders, isMuted, soundPreset, customSoundUrl]);

  const triggerAlert = (title) => {
    // Sound & Haptics
    playAlarmSound(null, null, title);

    // Android & Desktop System Notification Shade
    if ('Notification' in window && Notification.permission === 'granted') {
      const options = {
        body: title,
        icon: 'https://api.iconify.design/noto:bell.svg',
        badge: 'https://api.iconify.design/noto:bell.svg',
        vibrate: [300, 100, 300, 100, 300],
        requireInteraction: true,
        renotify: true,
        silent: isMuted,
        timestamp: Date.now(),
        tag: `rem_${Date.now()}`
      };

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready
          .then(reg => reg.showNotification('⏰ RemindAI Task Due!', options))
          .catch(() => new Notification('⏰ RemindAI Task Due!', options));
      } else {
        new Notification('⏰ RemindAI Task Due!', options);
      }
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

    // On rate limit (429), throw immediately so local assistant can respond in 0ms
    if (res.status === 429) {
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

  const parseSingleLocalReminder = (text) => {
    const lower = text.toLowerCase().trim();

    // 1. Simple Greetings
    if (['hi', 'hello', 'hey', 'hii', 'helo'].includes(lower)) {
      return {
        message: "Hello! 👋 What task would you like me to schedule for you?",
        reminders: []
      };
    }

    // Helper to sanitize title
    const sanitizeTitle = (str) => {
      let t = str
        .replace(/(?:remind me to|remember to|schedule|i have an|i have a|i have)\s+/gi, '')
        .replace(/\b(\d{1,2}(?::\d{2})?\s*(?:pm|am))\b/gi, '')
        .replace(/\b(\d{1,2}\s+\d{2})\b/gi, '')
        .replace(/\b(in\s+\d+\s*(?:min|mins|minute|minutes|m|hour|hours|h|day|days|d)?)\b/gi, '')
        .replace(/\b(tomorrow|tmrw|today|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
        .trim();

      t = t.replace(/\s+\b(on|at|for|in|to|by)\b$/i, '').trim();
      t = t.replace(/^(to\s+)/i, '').trim();

      if (!t || t.length < 2) t = "Task";
      return t.charAt(0).toUpperCase() + t.slice(1);
    };

    // Smart AM/PM calculation
    const calculateTargetTime = (h, m, ampm, isToday) => {
      const now = new Date();
      let target = new Date();
      let hours = h;

      if (ampm === 'pm' && hours < 12) hours += 12;
      else if (ampm === 'am' && hours === 12) hours = 0;
      else if (!ampm) {
        if (now.getHours() >= 12 && hours < 12) {
          hours += 12;
        }
      }

      target.setHours(hours, m, 0, 0);
      if (!isToday && target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1);
      }
      return target;
    };

    // Ambiguous Inputs without Time
    if (/^(i have an|i have a|i have)\s+[a-z\s]+$/i.test(text) && !/(today|tomorrow|tmrw|\d+|at|in|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(text)) {
      const cleanEvent = sanitizeTitle(text);
      return {
        message: `Good luck with your ${cleanEvent.toLowerCase()}! 🗓️ What day and time is it scheduled for?`,
        reminders: []
      };
    }

    let date = new Date();
    let matched = false;
    const hasToday = /\btoday\b/i.test(lower);

    // Pattern A: "in 15 min remind me to bath" / "drink water in 2 min"
    const inTimeMatch = lower.match(/in\s+(\d+)\s*(min|mins|minute|minutes|m|hour|hours|h|day|days|d)?/i);
    if (inTimeMatch) {
      const num = parseInt(inTimeMatch[1], 10);
      const unit = (inTimeMatch[2] || 'm').toLowerCase();
      if (unit.startsWith('h')) date.setHours(date.getHours() + num);
      else if (unit.startsWith('d')) date.setDate(date.getDate() + num);
      else date.setMinutes(date.getMinutes() + num);
      matched = true;
    }

    // Pattern B: "bath at 3 45" / "call dad at 6pm"
    const atTimeMatch = lower.match(/(?:at\s+)?(\d{1,2})(?::(\d{2})|\s+(\d{2}))\s*(pm|am)?/i);
    if (atTimeMatch && !matched) {
      const hours = parseInt(atTimeMatch[1], 10);
      const minutes = parseInt(atTimeMatch[2] || atTimeMatch[3] || '0', 10);
      const ampm = (atTimeMatch[4] || '').toLowerCase();
      date = calculateTargetTime(hours, minutes, ampm, hasToday);
      matched = true;
    }

    // Pattern C: "presentation tomorrow" / "exam monday"
    const dayMatch = lower.match(/(tomorrow|tmrw|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
    if (dayMatch && !matched) {
      const dayWord = dayMatch[1].toLowerCase();
      if (dayWord === 'tomorrow' || dayWord === 'tmrw') {
        date.setDate(date.getDate() + 1);
        if (!atTimeMatch) date.setHours(9, 0, 0, 0);
      } else {
        date.setDate(date.getDate() + 1);
      }
      matched = true;
    }

    const cleanTitle = sanitizeTitle(text);

    if (matched) {
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dayStr = date.toDateString() === new Date().toDateString() ? 'today' : 'tomorrow';
      return {
        message: `Got it! Scheduled "${cleanTitle}" for ${dayStr} at ${timeStr}.`,
        reminders: [{ title: cleanTitle, time: date.toISOString() }]
      };
    }

    return {
      message: `Got it! What time would you like me to set the reminder for "${cleanTitle}"? (e.g. "at 6pm" or "in 10 minutes")`,
      reminders: []
    };
  };

  const handleLocalAssistant = (text) => {
    // Check for multi-reminder input (e.g. "drink water in 10m, call dad at 6pm, and pay bills tomorrow")
    const rawClauses = text.split(/(?:,|;|\n|\balso\b|\band\b)/i)
      .map(c => c.trim())
      .filter(c => c.length > 2);

    // If we have multiple clauses AND at least one has a time pattern, treat as multi-reminder
    const hasTimePattern = rawClauses.some(c => /(in\s+\d+|at\s+\d+|\d+\s*(?:pm|am)|tomorrow|tmrw|today)/i.test(c));

    if (rawClauses.length > 1 && hasTimePattern) {
      const allReminders = [];
      const lines = [];
      const noTimeClauses = [];

      rawClauses.forEach(clause => {
        const res = parseSingleLocalReminder(clause);
        if (res.reminders.length > 0) {
          allReminders.push(...res.reminders);
          const r = res.reminders[0];
          lines.push(`• **${r.title}** (${formatTime(r.time)})`);
        } else {
          // Clause had no time — still create reminder if it looks like a task
          const hasTimeInfo = /(in\s+\d+|at\s+\d+|\d+\s*(?:pm|am)|tomorrow|tmrw|today)/i.test(clause);
          if (!hasTimeInfo && clause.length > 2) {
            noTimeClauses.push(clause);
          }
        }
      });

      if (allReminders.length > 0) {
        let message = `Got it! I created ${allReminders.length} separate reminders for you:\n\n${lines.join('\n')}`;
        if (noTimeClauses.length > 0) {
          message += `\n\nI couldn't determine the time for: ${noTimeClauses.map(c => `"${c}"`).join(', ')}. What time should I set ${noTimeClauses.length > 1 ? 'those' : 'that'} for?`;
        }
        return { message, reminders: allReminders };
      }
    }

    return parseSingleLocalReminder(text);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg = { id: Date.now(), role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      let result = null;
      if (geminiKey) {
        try {
          result = await callGemini(text);
        } catch (apiErr) {
          console.warn('AI API rate-limited or unavailable, switching to local smart assistant:', apiErr);
          result = handleLocalAssistant(text);
        }
      } else {
        result = handleLocalAssistant(text);
      }

      const assistantMsg = { id: Date.now() + 1, role: 'assistant', text: result.message };
      setMessages(prev => [...prev, assistantMsg]);

      setConversationHistory(prev => [
        ...prev,
        { role: 'user', parts: [{ text }] },
        { role: 'model', parts: [{ text: JSON.stringify(result) }] }
      ]);

      if (result.reminders?.length > 0) {
        addReminders(result.reminders);
      }
    } catch (err) {
      const fallback = handleLocalAssistant(text);
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'assistant', text: fallback.message }]);
      if (fallback.reminders?.length > 0) addReminders(fallback.reminders);
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
          <div className="brand-logo-icon">
            <Sparkles size={18} color="#ffffff" />
          </div>
          <span className="brand-name">RemindAI</span>
          <span className="brand-badge">PRO AI</span>
        </div>
        <div className="header-actions">
          <button
            className={`notif-btn ${notifStatus === 'granted' ? 'active' : ''}`}
            onClick={requestNotifications}
          >
            <span className="status-dot"></span>
            {notifStatus === 'granted'
              ? <><Bell size={15} /> Alerts On</>
              : <><BellOff size={15} /> Enable Alerts</>
            }
          </button>
          <button className="icon-btn" onClick={() => { setShowSettings(true); setTempKey(geminiKey); }} title="Settings">
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
                  <div className="avatar"><Bot size={16} /></div>
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
                <div className="avatar"><Bot size={16} /></div>
                <div className="bubble assistant typing">
                  <span className="dot" /><span className="dot" /><span className="dot" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form className="chat-input-row" onSubmit={handleSend}>
            <button
              type="button"
              className={`mic-btn ${isListening ? 'listening' : ''}`}
              onClick={toggleVoiceInput}
              title={isListening ? "Listening... Click to stop" : "Speak your reminder"}
            >
              {isListening ? <MicOff size={18} color="#f43f5e" /> : <Mic size={18} />}
            </button>
            <textarea
              className="chat-input"
              placeholder={isListening ? "Listening... Speak now..." : "Speak or type… e.g. 'drink water in 10m and call dad at 6pm'"}
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
          {/* Stats Bar */}
          <div className="dashboard-stats">
            <div className="stat-chip active">
              <span className="stat-count">{activeReminders.length}</span>
              <span className="stat-label">Upcoming</span>
            </div>
            <div className={`stat-chip ${activeReminders.filter(r => isOverdue(r.time)).length > 0 ? 'overdue' : ''}`}>
              <span className="stat-count">{activeReminders.filter(r => isOverdue(r.time)).length}</span>
              <span className="stat-label">Overdue</span>
            </div>
            <div className="stat-chip completed">
              <span className="stat-count">{completedReminders.length}</span>
              <span className="stat-label">Done</span>
            </div>
          </div>

          {/* Active reminders */}
          <div className="glass reminder-section">
            <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={16} color="#a855f7" />
                <span>Upcoming ({activeReminders.length})</span>
              </div>
              <button
                className="icon-btn"
                style={{ width: '28px', height: '28px' }}
                onClick={openManualAddModal}
                title="Add Reminder Manually"
              >
                <Plus size={16} />
              </button>
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
              <h3>Settings & Configuration</h3>
              <button className="icon-btn" onClick={() => setShowSettings(false)}><X size={18} /></button>
            </div>

            {/* AI API Section */}
            <div style={{ marginBottom: '20px' }}>
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
                </a>. Stored locally in browser.
              </p>
            </div>

            {/* Sound & Notification Settings */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span className="modal-label" style={{ margin: 0, fontWeight: 600, color: 'var(--txt)' }}>
                  Alarm Sound Settings
                </span>
                <button
                  type="button"
                  className="notif-btn"
                  style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                  onClick={() => {
                    const newMuted = !isMuted;
                    setIsMuted(newMuted);
                    localStorage.setItem('alarm_muted', newMuted.toString());
                  }}
                >
                  {isMuted ? <><VolumeX size={14} color="#f87171" /> Muted</> : <><Volume2 size={14} color="#34d399" /> Sound On</>}
                </button>
              </div>

              {!isMuted && (
                <>
                  <label className="modal-label">Select Alarm Tone</label>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                    <select
                      className="modal-input"
                      value={soundPreset}
                      onChange={e => {
                        const val = e.target.value;
                        setSoundPreset(val);
                        localStorage.setItem('alarm_preset', val);
                      }}
                      style={{ flex: 1 }}
                    >
                      <option value="sine">🔔 Default Beep</option>
                      <option value="speech">🗣️ Read Title Aloud (Voice Announcement)</option>
                      <option value="chime">✨ Gentle Chime</option>
                      <option value="marimba">🎵 Marimba Melody</option>
                      <option value="custom">📁 Custom Audio File</option>
                    </select>

                    <button
                      type="button"
                      className="btn-ghost"
                      style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                      onClick={() => playAlarmSound(soundPreset, customSoundUrl)}
                      title="Test Sound"
                    >
                      <Play size={14} /> Test
                    </button>
                  </div>

                  {soundPreset === 'custom' && (
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                      <label className="modal-label" style={{ marginBottom: '6px' }}>Upload Audio File (MP3, WAV)</label>
                      <input
                        type="file"
                        accept="audio/*"
                        id="custom-sound-file"
                        style={{ display: 'none' }}
                        onChange={handleFileUpload}
                      />
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <label htmlFor="custom-sound-file" className="btn-ghost" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Upload size={14} /> Choose File
                        </label>
                        <span style={{ fontSize: '0.8rem', color: 'var(--txt-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', flex: 1 }}>
                          {customFileName || 'No custom sound selected'}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setShowSettings(false)}>Cancel</button>
              <button className="btn-primary" onClick={() => {
                localStorage.setItem('gemini_api_key', tempKey);
                setGeminiKey(tempKey);
                setShowSettings(false);
              }}>Save Settings</button>
            </div>
          </div>
        </div>
      )}
      {/* Manual Add Reminder Modal */}
      {showManualAdd && (
        <div className="modal-overlay" onClick={() => setShowManualAdd(false)}>
          <div className="modal glass" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add New Reminder</h3>
              <button className="icon-btn" onClick={() => setShowManualAdd(false)}><X size={18} /></button>
            </div>

            <form onSubmit={handleSaveManualReminder}>
              <div style={{ marginBottom: '16px' }}>
                <label className="modal-label">Reminder Title</label>
                <input
                  type="text"
                  className="modal-input"
                  placeholder="e.g. Call Mom, Water plants, Meeting…"
                  value={manualTitle}
                  onChange={e => setManualTitle(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                <div>
                  <label className="modal-label">Date</label>
                  <input
                    type="date"
                    className="modal-input"
                    value={manualDate}
                    onChange={e => setManualDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="modal-label">Time</label>
                  <input
                    type="time"
                    className="modal-input"
                    value={manualTime}
                    onChange={e => setManualTime(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={() => setShowManualAdd(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={!manualTitle.trim()}>
                  Add Reminder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
