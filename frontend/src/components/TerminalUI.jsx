import React, { useState, useEffect, useRef } from 'react';

// optional sound for private messages (put ping.mp3 in /public)
let pingSound;
try { pingSound = new Audio('/ping.mp3'); } catch { pingSound = null; }

function dateLabel(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  // return 'DD MMM YYYY' like '05 Nov 2025'
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function timeLabel(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function TerminalUI({ socket, nick, setNick }) {
  const [messages, setMessages] = useState([]); // messages include {type, text, nick, ts, historical}
  const [users, setUsers] = useState({});
  const [unreadPM, setUnreadPM] = useState({});
  const [input, setInput] = useState('');
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'green');
  const [isAdmin, setIsAdmin] = useState(false);

  const chatRef = useRef(null);
  const inputRef = useRef(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Apply persisted theme on mount
  useEffect(() => {
    const t = localStorage.getItem('theme') || 'green';
    setTheme(t);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    switch (theme) {
      case 'light':
        root.style.setProperty('--bg', '#f4f4f4');
        root.style.setProperty('--text', '#222');
        root.style.setProperty('--accent', '#007aff');
        break;
      case 'dark':
        root.style.setProperty('--bg', '#0b0f10');
        root.style.setProperty('--text', '#9db0a5');
        root.style.setProperty('--accent', '#00ff6a');
        break;
      case 'green':
      default:
        root.style.setProperty('--bg', '#041208');
        root.style.setProperty('--text', '#9df5c3');
        root.style.setProperty('--accent', '#00ff6a');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  // scroll to bottom when messages change (but keep position if user scrolls up)
  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (atBottom) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // normalize incoming messages and handle history vs live
  useEffect(() => {
    if (!socket) return;

    const onMessage = (ev) => {
      let payload;
      try { payload = JSON.parse(ev.data); } catch { return; }

      // handle history payload
      if (payload.type === 'history' && Array.isArray(payload.history)) {
        // mark history messages as historical
        const hist = payload.history.map((m) => {
          return {
            ...m,
            historical: true,
            // make sure ts exists
            ts: m.ts || Date.now(),
            type: m.type || 'system',
            text: m.text || (m.type === 'message' ? m.text : '')
          };
        });
        setMessages((prev) => {
          // combine history (older) with any existing live messages, but avoid duplicates
          // If prev contains live messages already we append them after history.
          // To avoid duplicates, we'll check by ts + text + nick uniqueness.
          const key = (it) => `${it.type}|${it.ts}|${it.nick||''}|${it.text||''}`;
          const seen = new Set(hist.map(key));
          const remaining = prev.filter(p => !seen.has(key(p)));
          return [...hist, ...remaining];
        });
        setHistoryLoaded(true);
        return;
      }

      // user-list (accept both 'user-list' and 'userlist')
      if (payload.type === 'user-list' || payload.type === 'userlist') {
        const raw = payload.users || payload.list || [];
        // normalize to map
        const map = {};
        if (Array.isArray(raw)) {
          raw.forEach(u => {
            const name = u.nick || u.name || u.username;
            if (!name) return;
            map[name] = { admin: !!(u.isAdmin || u.admin) };
          });
        } else if (typeof raw === 'object') {
          Object.keys(raw).forEach(k => {
            const val = raw[k] || {};
            map[k] = { admin: !!(val.isAdmin || val.admin) };
          });
        }
        setUsers(map);
        return;
      }

      // admin status
      if (payload.type === 'admin-status') {
        setIsAdmin(Boolean(payload.value));
        return;
      }

      // clear
      if (payload.type === 'clear') {
        setMessages([]);
        setHistoryLoaded(true); // cleared state considered history-loaded (no old messages)
        return;
      }

      // normal messages
      if (payload.type === 'message' || payload.type === 'system' || payload.type === 'pm' || payload.type === 'private') {
        const normalized = { ...payload };
        if (payload.type === 'private') normalized.type = 'pm';
        // treat as live (not historical)
        normalized.historical = false;
        normalized.ts = payload.ts || Date.now();
        // if pm and destined to me, mark unread
        if (normalized.type === 'pm') {
          const to = normalized.to || normalized.target;
          const from = normalized.from || normalized.nick || normalized.sender;
          if (to === nick && from && from !== nick) {
            setUnreadPM(prev => ({ ...prev, [from]: (prev[from] || 0) + 1 }));
            try { pingSound && pingSound.play().catch(() => {}); } catch {}
            document.title = `📩 New PM from ${from}`;
          }
        }
        setMessages(prev => [...prev, normalized]);
        return;
      }
    };

    socket.addEventListener('message', onMessage);
    return () => socket.removeEventListener('message', onMessage);
  }, [socket, nick]);

  // helpers
  const addLocalSystem = (text) => {
    setMessages(prev => [...prev, { type: 'system', text, ts: Date.now(), historical: false, local: true }]);
  };

  // command handling
  const handleCommand = (line) => {
    const [cmd, ...parts] = line.substring(1).split(/\s+/);
    const args = parts.join(' ');
    switch (cmd) {
      case 'help':
        addLocalSystem('Available commands: /help, /commands, /nick <name>, /theme <green|dark|light>, /msg <user> <message>, /login <key>, /logout, /clear');
        break;
      case 'commands':
        addLocalSystem('/help /commands /nick /theme /msg /login /logout /clear');
        break;
      case 'nick':
        if (!args) return addLocalSystem('Usage: /nick <name>');
        setNick(args.substring(0, 48));
        if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'nick', newNick: args.substring(0, 48) }));
        break;
      case 'theme':
        if (!['green','dark','light'].includes(args)) return addLocalSystem('Usage: /theme <green|dark|light>');
        setTheme(args);
        addLocalSystem(`Theme set to ${args}`);
        break;
      case 'msg':
        {
          const [to, ...rest] = parts;
          const text = rest.join(' ');
          if (!to || !text) return addLocalSystem('Usage: /msg <user> <message>');
          if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'private', to, text }));
          // echo
          setMessages(prev => [...prev, { type: 'pm', from: nick, to, text, ts: Date.now(), historical: false }]);
        }
        break;
      case 'login':
        if (!args) return addLocalSystem('Usage: /login <key>');
        if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'login', key: args }));
        addLocalSystem('Attempting login...');
        break;
      case 'logout':
        if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'logout' }));
        addLocalSystem('Logging out...');
        break;
      case 'clear':
        if (isAdmin) {
          if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'clear' }));
        } else {
          setMessages([]);
          addLocalSystem('Local chat cleared');
        }
        break;
      default:
        addLocalSystem(`Unknown command: /${cmd}`);
    }
  };

  const sendMessage = () => {
    const text = input.trim();
    if (!text) return;
    if (text.startsWith('/')) handleCommand(text);
    else {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'message', text }));
      } else {
        addLocalSystem('Socket is not connected.');
      }
    }
    setInput('');
  };

  // Build grouped view: groups by date, and insert "New messages" separator between historical and live messages
  function buildGroups() {
    const groups = [];
    let sawLive = false;
    let insertedNewMarker = false;

    for (const m of messages) {
      const label = dateLabel(m.ts);
      if (!groups.length || groups[groups.length - 1].label !== label) {
        groups.push({ label, items: [] });
      }
      // when encountering the first non-historical message after historicals, mark new separator
      if (!m.historical) sawLive = true;
      groups[groups.length - 1].items.push(m);
    }

    // We want to determine where history ends and live messages start and render a "New messages" marker.
    // Find index of last historical message in the flattened messages array.
    const lastHistoricalIndex = (() => {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].historical) return i;
      }
      return -1;
    })();

    return { groups, lastHistoricalIndex };
  }

  function renderGroups() {
    const { groups, lastHistoricalIndex } = buildGroups();
    // flatten index mapping to know positions
    let flatIndex = -1;
    return groups.map((g, gi) => (
      <div key={gi} className="mb-3">
        <div className="text-xs opacity-60 mb-2">{g.label}</div>
        {g.items.map((m, mi) => {
          flatIndex++;
          const isNewMarker = flatIndex === lastHistoricalIndex + 1; // first live after history
          return (
            <React.Fragment key={mi}>
              {isNewMarker && lastHistoricalIndex >= 0 && (
                <div className="text-center my-2 text-sm opacity-80" style={{ color: 'var(--accent)' }}>
                  — New messages —
                </div>
              )}
              <div className="mb-1 leading-snug">
                {m.type === 'message' && (
                  <div>
                    <span className="font-bold" style={{ color: 'var(--accent)', cursor: 'pointer' }} onClick={() => onClickUser(m.nick)}>{m.nick}</span>
                    <span className="text-xs opacity-60"> @{timeLabel(m.ts)}</span>
                    : <span>{m.text}</span>
                  </div>
                )}
                {m.type === 'pm' && (
                  <div>
                    <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                      [PM] {m.from === nick ? `→ ${m.to}` : `${m.from} → you`}
                    </span>: {m.text}
                  </div>
                )}
                {m.type === 'system' && (
                  <div className="opacity-70">{m.text}</div>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    ));
  }

  const onClickUser = (username) => {
    setInput(`/msg ${username} `);
    inputRef.current?.focus();
    setUnreadPM(prev => {
      const copy = { ...prev };
      delete copy[username];
      return copy;
    });
    // clear title if no unread remain
    const remaining = Object.values(unreadPM).reduce((a, b) => a + (b || 0), 0);
    if (remaining <= 1) document.title = 'TerminusChat';
  };

  const formatUsers = () => {
    return Object.entries(users); // [ [name, {admin}] ... ]
  };

  return (
    <div className="flex flex-col flex-1 h-[100dvh] w-full overflow-hidden" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <div className="flex flex-1 overflow-hidden sm:flex-row flex-col gap-2 sm:gap-4 p-2">
        {/* Chat column */}
        <div className="flex flex-col flex-1 overflow-hidden rounded-lg border border-gray-800 bg-[rgba(0,0,0,0.18)]">
          <div ref={chatRef} className="flex-1 overflow-y-auto px-3 py-2 sm:p-4 text-sm sm:text-base" style={{ scrollBehavior: 'smooth', wordBreak: 'break-word', overscrollBehavior: 'contain' }}>
            {renderGroups()}
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 p-2 sm:p-3 border-t border-gray-700 bg-[rgba(0,0,0,0.25)]">
            <input
              ref={inputRef}
              className="flex-1 bg-[rgba(0,0,0,0.36)] border border-gray-700 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
              placeholder="Type a message or /command (eg. /help)"
              inputMode="text"
              enterKeyHint="send"
              aria-label="Message input"
            />
            <button onClick={sendMessage} className="px-3 py-2 rounded-md text-sm sm:text-base font-semibold" style={{ background: 'var(--accent)', color: '#000' }}>
              Send
            </button>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="sm:w-64 w-full sm:max-w-none flex-shrink-0 overflow-y-auto rounded-lg border border-gray-800 bg-[rgba(0,0,0,0.18)] p-3">
          <div className="mb-2 text-[var(--accent)] font-semibold">Online Users</div>
          <div className="flex flex-col gap-2">
            {formatUsers().length === 0 && <div className="text-gray-500 text-sm">No users online</div>}
            {formatUsers().map(([username, info]) => (
              <div key={username} onClick={() => onClickUser(username)} className="cursor-pointer flex items-center justify-between rounded-md px-2 py-1 hover:bg-[rgba(255,255,255,0.03)]">
                <div style={{ color: info.admin ? 'gold' : 'var(--text)' }}>{username === nick ? `${username} (you)` : username}</div>
                {unreadPM[username] ? <div className="text-xs bg-[var(--accent)] text-black rounded-full px-2 py-0.5 font-bold">{unreadPM[username]}</div> : null}
              </div>
            ))}
          </div>

          <hr className="my-3 border-gray-700" />
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">Theme:</label>
            <select value={theme} onChange={(e) => setTheme(e.target.value)} className="bg-[rgba(0,0,0,0.36)] border border-gray-700 rounded px-2 py-1 text-sm">
              <option value="green">Matrix</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>

          {isAdmin && (
            <div className="mt-3">
              <button onClick={() => socket && socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: 'clear' }))} className="text-xs text-black font-semibold px-3 py-1 rounded" style={{ background: 'var(--accent)' }}>
                Clear Global Chat
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
