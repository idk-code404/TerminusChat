import React, { useState, useEffect, useRef } from 'react';

// optional sound for private messages (put ping.mp3 in /public)
let pingSound;
try { pingSound = new Audio('/ping.mp3'); } catch { pingSound = null; }

export default function TerminalUI({ socket, nick, setNick }) {
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState({}); // normalized map: { username: { admin: bool } }
  const [unreadPM, setUnreadPM] = useState({});
  const [input, setInput] = useState('');
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'green');
  const [isAdmin, setIsAdmin] = useState(false);

  const chatRef = useRef(null);
  const inputRef = useRef(null);

  // Apply theme variables
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

  // scroll to bottom when messages change
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  // normalize server user list into map {name: { admin: bool }}
  function normalizeUsers(raw) {
    if (!raw) return {};
    // if array of objects: [{nick, isAdmin}, ...]
    if (Array.isArray(raw)) {
      const map = {};
      raw.forEach((u) => {
        const name = u.nick || u.name || u.username;
        if (!name) return;
        map[name] = { admin: !!(u.isAdmin || u.admin || u.is_admin) };
      });
      return map;
    }
    // if already an object map (username -> {..})
    if (typeof raw === 'object') {
      const out = {};
      for (const k of Object.keys(raw)) {
        const val = raw[k] || {};
        out[k] = { admin: !!(val.isAdmin || val.admin || val.is_admin) };
      }
      return out;
    }
    return {};
  }

  // WebSocket message handling (robust: handles 'user-list'/'userlist', 'private'/'pm', etc)
  useEffect(() => {
    if (!socket) return;
    const onMessage = (ev) => {
      let payload;
      try { payload = JSON.parse(ev.data); } catch {
        // ignore non-json
        return;
      }

      // user list (server might send 'user-list' or 'userlist' or 'user-list')
      if (payload.type === 'user-list' || payload.type === 'userlist' || payload.type === 'user_list') {
        const normalized = normalizeUsers(payload.users || payload.list || payload.usersOnline || payload.usersMap);
        setUsers(normalized);
        return;
      }

      // admin status
      if (payload.type === 'admin-status' || payload.type === 'loginResult' || payload.type === 'logoutResult') {
        if (payload.type === 'admin-status') setIsAdmin(Boolean(payload.value));
        else if (payload.type === 'loginResult') setIsAdmin(Boolean(payload.ok));
        else if (payload.type === 'logoutResult') setIsAdmin(false);
        return;
      }

      // messages: accept 'message', 'system', 'pm', 'private'
      if (payload.type === 'message' || payload.type === 'system' || payload.type === 'pm' || payload.type === 'private') {
        // normalize private to pm
        const normalized = { ...payload };
        if (payload.type === 'private') normalized.type = 'pm';
        if (payload.type === 'pm' && !('from' in normalized)) normalized.from = payload.nick || payload.sender || payload.from;
        if (payload.type === 'message' && !('nick' in normalized)) normalized.nick = payload.from || payload.nick;

        setMessages((prev) => [...prev, normalized]);

        // unread handling: if pm to me and not from me
        if (normalized.type === 'pm') {
          const to = normalized.to || normalized.toUser || normalized.target;
          const from = normalized.from || normalized.nick || normalized.sender;
          if (to === nick && from && from !== nick) {
            setUnreadPM((prev) => ({ ...prev, [from]: (prev[from] || 0) + 1 }));
            try { pingSound && pingSound.play().catch(() => {}); } catch {}
            document.title = `📩 New PM from ${from}`;
          }
        }
      }
    };

    socket.addEventListener('message', onMessage);
    return () => socket.removeEventListener('message', onMessage);
  }, [socket, nick]);

  // send commands (help, commands, nick, theme, msg, login, logout, clear)
  const addLocalMessage = (text, type = 'system') => {
    setMessages((prev) => [...prev, { type, text, local: true, ts: Date.now() }]);
  };

  const sendCommand = (cmdline) => {
    const [cmd, ...args] = cmdline.slice(1).split(' ');
    const argStr = args.join(' ').trim();

    switch (cmd) {
      case 'help':
        addLocalMessage(
          `[system] Available commands:\n` +
          `/help - show this message\n` +
          `/commands - list commands\n` +
          `/nick <name> - change your nickname\n` +
          `/theme <green|dark|light> - change theme\n` +
          `/msg <user> <message> - send private message\n` +
          `/login <key> - admin login\n` +
          `/logout - admin logout\n` +
          `/clear - clear chat (admin can clear global)`
        );
        break;

      case 'commands':
        addLocalMessage(`[system] Commands: /help, /commands, /nick, /theme, /msg, /login, /logout, /clear`);
        break;

      case 'nick':
        if (!argStr) return addLocalMessage(`[system] Usage: /nick <name>`);
        setNick(argStr);
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'nick', newNick: argStr }));
        }
        addLocalMessage(`[system] Your nickname is now ${argStr}`);
        break;

      case 'theme':
        if (!['green','dark','light'].includes(argStr)) return addLocalMessage(`[system] Usage: /theme <green|dark|light>`);
        setTheme(argStr === 'dark' ? 'dark' : argStr === 'light' ? 'light' : 'green');
        addLocalMessage(`[system] Theme changed to ${argStr}`);
        break;

      case 'msg':
        if (args.length < 2) return addLocalMessage(`[system] Usage: /msg <user> <message>`);
        const to = args[0];
        const text = args.slice(1).join(' ');
        if (socket && socket.readyState === WebSocket.OPEN) {
          // server may expect 'private' or 'pm' — send both-friendly 'private'
          socket.send(JSON.stringify({ type: 'private', to, text }));
        }
        addLocalMessage(`[to ${to}] ${text}`, 'pm');
        break;

      case 'login':
        if (!argStr) return addLocalMessage(`[system] Usage: /login <key>`);
        socket && socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: 'login', key: argStr }));
        addLocalMessage(`[system] Attempting admin login...`);
        break;

      case 'logout':
        socket && socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: 'logout' }));
        setIsAdmin(false);
        addLocalMessage(`[system] Logged out of admin mode.`);
        break;

      case 'clear':
        if (isAdmin) {
          socket && socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: 'clear' }));
          addLocalMessage(`[system] Sent global clear request.`);
        } else {
          setMessages([]);
          addLocalMessage(`[system] Local chat cleared.`);
        }
        break;

      default:
        addLocalMessage(`[system] Unknown command: /${cmd}`);
    }
  };

  const sendMessage = () => {
    const text = input.trim();
    if (!text) return;
    if (text.startsWith('/')) sendCommand(text);
    else socket && socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: 'message', text }));
    setInput('');
  };

  // click username to PM + clear unread counter for that user
  const onUserClick = (username) => {
    setInput(`/msg ${username} `);
    inputRef.current?.focus();
    setUnreadPM((prev) => {
      const copy = { ...prev };
      delete copy[username];
      return copy;
    });
    // if no unread remain, restore title
    const remaining = Object.values(unreadPM).reduce((a,b) => a + b, 0);
    if (!remaining) document.title = 'TerminusChat';
  };

  const timeFmt = (ts) => ts ? new Date(ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) : '';

  // prepare list entries for rendering
  const userEntries = Object.entries(users); // [ [name, {admin}], ... ]

  // apply persisted theme on mount (ensures CSS vars set)
  useEffect(() => {
    const t = localStorage.getItem('theme') || 'green';
    setTheme(t);
  }, []);

  return (
    <div className="flex flex-col flex-1 h-[100dvh] w-full overflow-hidden" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <div className="flex flex-1 overflow-hidden sm:flex-row flex-col gap-2 sm:gap-4 p-2">
        {/* Chat area */}
        <div className="flex flex-col flex-1 overflow-hidden rounded-lg border border-gray-800 bg-[rgba(0,0,0,0.18)]">
          <div
            ref={chatRef}
            className="flex-1 overflow-y-auto px-3 py-2 sm:p-4 text-sm sm:text-base"
            style={{ scrollBehavior: 'smooth', wordBreak: 'break-word', overscrollBehavior: 'contain' }}
          >
            {messages.map((m, i) => {
              const t = m.type === 'private' ? 'pm' : m.type;
              if (t === 'message') {
                const author = m.nick || m.from || m.sender || 'unknown';
                return (
                  <div key={i} className="mb-1 leading-snug">
                    <span className="font-bold cursor-pointer" style={{ color: 'var(--accent)' }} onClick={() => onUserClick(author)}>{author}</span>
                    <span className="text-xs opacity-60"> @{timeFmt(m.ts)}</span>: {m.text}
                  </div>
                );
              }
              if (t === 'pm') {
                const from = m.from || m.nick || m.sender || 'unknown';
                const to = m.to || m.target;
                return (
                  <div key={i} className="mb-1 leading-snug">
                    <span className="text-[var(--accent)] font-semibold">
                      [PM] {from === nick ? `→ ${to}` : `${from} → you`}
                    </span>: {m.text}
                  </div>
                );
              }
              if (t === 'system') {
                return <div key={i} className="mb-1 opacity-70">{m.text}</div>;
              }
              // fallback
              return <div key={i} className="mb-1">{JSON.stringify(m)}</div>;
            })}
          </div>

          {/* Input row */}
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
            <button
              onClick={sendMessage}
              className="px-3 py-2 rounded-md text-sm sm:text-base font-semibold"
              style={{ background: 'var(--accent)', color: '#000' }}
            >
              Send
            </button>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="sm:w-64 w-full sm:max-w-none flex-shrink-0 overflow-y-auto rounded-lg border border-gray-800 bg-[rgba(0,0,0,0.18)] p-3">
          <div className="mb-2 text-[var(--accent)] font-semibold">Online Users</div>

          {userEntries.length === 0 ? (
            <div className="text-gray-500 text-sm">No users online</div>
          ) : (
            <div className="flex flex-col gap-2">
              {userEntries.map(([username, info]) => (
                <div key={username} onClick={() => onUserClick(username)} title={`Click to PM ${username}`} className="cursor-pointer flex items-center justify-between rounded-md px-2 py-1 hover:bg-[rgba(255,255,255,0.03)]">
                  <div style={{ color: info.admin ? 'gold' : 'var(--text)' }}>
                    {username === nick ? `${username} (you)` : username}
                  </div>
                  {unreadPM[username] ? <div className="text-xs bg-[var(--accent)] text-black rounded-full px-2 py-0.5 font-bold">{unreadPM[username]}</div> : null}
                </div>
              ))}
            </div>
          )}

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
