import React, { useState, useEffect, useRef } from 'react';

// sound for PM notifications
const pingSound = new Audio('/ping.mp3'); // optional: add this to /public

export default function TerminalUI({ socket, nick, setNick }) {
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState({});
  const [unreadPM, setUnreadPM] = useState({});
  const [input, setInput] = useState('');
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'green');
  const [isAdmin, setIsAdmin] = useState(false);

  const chatRef = useRef(null);
  const inputRef = useRef(null);

  // Apply theme
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

  // Auto scroll
  useEffect(() => {
    if (chatRef.current)
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  // WebSocket events
  useEffect(() => {
    if (!socket) return;

    const handleMessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data.type === 'message' || data.type === 'system' || data.type === 'pm') {
        setMessages((prev) => [...prev, data]);
        if (data.type === 'pm' && data.to === nick) {
          // add unread count
          setUnreadPM((prev) => ({
            ...prev,
            [data.from]: (prev[data.from] || 0) + 1,
          }));
          try {
            pingSound.play().catch(() => {});
          } catch {}
        }
      }

      if (data.type === 'userlist') setUsers(data.users);
      if (data.type === 'loginResult' && data.ok) setIsAdmin(true);
      if (data.type === 'logoutResult') setIsAdmin(false);
    };

    socket.addEventListener('message', handleMessage);
    return () => socket.removeEventListener('message', handleMessage);
  }, [socket, nick]);

  const sendCommand = (cmdline) => {
    const [cmd, ...args] = cmdline.slice(1).split(' ');
    const argStr = args.join(' ');

    switch (cmd) {
      case 'theme':
        if (['light', 'dark', 'green'].includes(argStr)) setTheme(argStr);
        addLocalMessage(`[system] Theme changed to ${argStr}`);
        break;

      case 'login':
        socket.send(JSON.stringify({ type: 'login', key: argStr }));
        addLocalMessage(`[system] Attempting login...`);
        break;

      case 'logout':
        socket.send(JSON.stringify({ type: 'logout' }));
        addLocalMessage(`[system] Logged out`);
        break;

      case 'clear':
        if (isAdmin) socket.send(JSON.stringify({ type: 'clear' }));
        setMessages([]);
        addLocalMessage(`[system] Chat cleared (local)`);
        break;

      case 'nick':
        if (!argStr) return addLocalMessage(`[system] Usage: /nick <name>`);
        setNick(argStr);
        addLocalMessage(`[system] Your nickname is now ${argStr}`);
        break;

      case 'msg':
        if (args.length < 2)
          return addLocalMessage(`[system] Usage: /msg <user> <message>`);
        const target = args[0];
        const msgText = args.slice(1).join(' ');
        socket.send(JSON.stringify({ type: 'pm', to: target, text: msgText }));
        addLocalMessage(`[to ${target}] ${msgText}`, 'pm');
        break;

      default:
        addLocalMessage(`[system] Unknown command: /${cmd}`);
    }
  };

  const sendMessage = () => {
    if (!input.trim()) return;
    if (input.startsWith('/')) sendCommand(input.trim());
    else socket.send(JSON.stringify({ type: 'message', text: input.trim() }));
    setInput('');
  };

  const addLocalMessage = (text, type = 'system') => {
    setMessages((prev) => [...prev, { type, text, local: true, ts: Date.now() }]);
  };

  const handleUserClick = (username) => {
    setInput(`/msg ${username} `);
    inputRef.current?.focus();
  };

  const formatTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      className="flex flex-col flex-1 h-[100dvh] w-full overflow-hidden"
      style={{
        background: 'var(--bg)',
        color: 'var(--text)',
      }}
    >
      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden sm:flex-row flex-col gap-2 sm:gap-4">
        
        {/* Chat section */}
        <div className="flex flex-col flex-1 overflow-hidden rounded-lg border border-gray-800 bg-[rgba(0,0,0,0.25)]">
          <div
            ref={chatRef}
            className="flex-1 overflow-y-auto px-3 py-2 sm:p-4 text-sm sm:text-base"
            style={{
              scrollBehavior: 'smooth',
              wordBreak: 'break-word',
              overscrollBehavior: 'contain',
            }}
          >
            {messages.map((msg, i) => (
              <div key={i} className="mb-1 leading-snug">
                {msg.type === 'message' && (
                  <span>
                    <span
                      className="font-bold cursor-pointer"
                      style={{ color: 'var(--accent)' }}
                      onClick={() => handleUserClick(msg.nick)}
                    >
                      {msg.nick}
                    </span>
                    <span className="text-xs opacity-60"> @{formatTime(msg.ts)}</span>
                    : {msg.text}
                  </span>
                )}
                {msg.type === 'pm' && (
                  <span>
                    <span className="text-[var(--accent)] font-semibold">
                      [PM] {msg.from === nick ? `→ ${msg.to}` : `${msg.from} → you`}
                    </span>
                    : {msg.text}
                  </span>
                )}
                {msg.type === 'system' && (
                  <span className="opacity-70">{msg.text}</span>
                )}
              </div>
            ))}
          </div>

          {/* Input row */}
          <div className="flex items-center gap-2 p-2 sm:p-3 border-t border-gray-700 bg-[rgba(0,0,0,0.35)]">
            <input
              ref={inputRef}
              className="flex-1 bg-[rgba(0,0,0,0.4)] border border-gray-700 rounded-md px-3 py-2
                         focus:outline-none focus:ring-1 focus:ring-[var(--accent)] text-[var(--text)]"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Type a message or command..."
              inputMode="text"
              enterKeyHint="send"
            />
            <button
              className="px-3 py-2 rounded-md text-sm sm:text-base"
              style={{
                background: 'var(--accent)',
                color: '#000',
                fontWeight: 600,
              }}
              onClick={sendMessage}
            >
              Send
            </button>
          </div>
        </div>

        {/* Sidebar: Users */}
        <aside className="sm:w-64 w-full sm:max-w-none flex-shrink-0 overflow-y-auto rounded-lg border border-gray-800 bg-[rgba(0,0,0,0.25)] p-3">
          <div className="mb-2 text-[var(--accent)] font-semibold">Online Users</div>
          <div className="flex flex-wrap sm:flex-col gap-2 sm:gap-1">
            {Object.keys(users).length === 0 && (
              <div className="text-gray-500 text-sm">No users</div>
            )}
            {Object.entries(users).map(([username, data]) => (
              <div
                key={username}
                onClick={() => handleUserClick(username)}
                className="cursor-pointer flex items-center justify-between rounded-md px-2 py-1 hover:bg-[rgba(255,255,255,0.05)]"
              >
                <span style={{ color: data.admin ? 'gold' : 'var(--text)' }}>
                  {username === nick ? `${username} (you)` : username}
                </span>
                {unreadPM[username] && (
                  <span className="text-xs bg-[var(--accent)] text-black rounded-full px-2 py-0.5 font-bold">
                    {unreadPM[username]}
                  </span>
                )}
              </div>
            ))}
          </div>

          <hr className="my-3 border-gray-700" />
          <div>
            <label className="text-sm text-gray-400 mr-2">Theme:</label>
            <select
              className="bg-[rgba(0,0,0,0.4)] border border-gray-700 rounded px-2 py-1 text-sm"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
            >
              <option value="green">Matrix</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>

          {isAdmin && (
            <div className="mt-3">
              <button
                className="text-xs text-black font-semibold px-3 py-1 rounded"
                style={{ background: 'var(--accent)' }}
                onClick={() => socket.send(JSON.stringify({ type: 'clear' }))}
              >
                Clear Global Chat
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
