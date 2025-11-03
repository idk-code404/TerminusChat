import React, { useState, useEffect, useRef } from 'react';

const pingSound = new Audio('/ping.mp3');

export default function TerminalUI({ socket, nick, setNick }) {
  // Load nickname from localStorage or fallback
  const savedNick = localStorage.getItem('nickname') || nick || `guest${Math.floor(Math.random() * 1000)}`;
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

  // Restore saved nickname on load
  useEffect(() => {
    setNick(savedNick);
    localStorage.setItem('nickname', savedNick);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'nick', nick: savedNick }));
    }
  }, [socket]);

  // Scroll chat to bottom
  useEffect(() => {
    if (chatRef.current)
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  // Handle incoming messages
  useEffect(() => {
    if (!socket) return;

    const handleMessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }

      switch (data.type) {
        case 'history':
          setMessages(data.chat || []);
          break;
        case 'message':
        case 'system':
          setMessages((prev) => [...prev, data]);
          break;
        case 'pm':
          setMessages((prev) => [...prev, data]);
          if (data.to === savedNick) {
            setUnreadPM((prev) => ({ ...prev, [data.from]: (prev[data.from] || 0) + 1 }));
            try { pingSound.play().catch(() => {}); } catch {}
          }
          break;
        case 'userlist':
          setUsers(data.users);
          break;
        case 'loginResult':
          if (data.ok) setIsAdmin(true);
          break;
        case 'logoutResult':
          setIsAdmin(false);
          break;
        case 'clear':
          setMessages([]);
          break;
        default: break;
      }
    };

    socket.addEventListener('message', handleMessage);
    return () => socket.removeEventListener('message', handleMessage);
  }, [socket]);

  const formatTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const addLocalMessage = (text, type = 'system') => {
    setMessages((prev) => [...prev, { type, text, local: true, ts: Date.now() }]);
  };

  const handleUserClick = (username) => {
    setInput(`/msg ${username} `);
    inputRef.current?.focus();
    setUnreadPM((prev) => ({ ...prev, [username]: 0 }));
  };

  const sendCommand = (cmdline) => {
    const [cmd, ...args] = cmdline.slice(1).split(' ');
    const argStr = args.join(' ');

    switch (cmd) {
      case 'help':
        addLocalMessage(
          `[system] Available commands:\n` +
          `/help - show this message\n` +
          `/commands - list commands\n` +
          `/nick <name> - change nickname\n` +
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
        localStorage.setItem('nickname', argStr); // save nickname
        socket.send(JSON.stringify({ type: 'nick', nick: argStr }));
        addLocalMessage(`[system] Your nickname is now ${argStr}`);
        break;

      case 'msg':
        if (args.length < 2) return addLocalMessage(`[system] Usage: /msg <user> <message>`);
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

  return (
    <div className="flex flex-col flex-1 h-[100dvh] w-full overflow-hidden" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <div className="flex flex-1 overflow-hidden sm:flex-row flex-col gap-2 sm:gap-4">
        <div className="flex flex-col flex-1 overflow-hidden rounded-lg border border-gray-800 bg-[rgba(0,0,0,0.25)]">
          <div ref={chatRef} className="flex-1 overflow-y-auto px-3 py-2 sm:p-4 text-sm sm:text-base" style={{ scrollBehavior: 'smooth', wordBreak: 'break-word' }}>
            {messages.map((msg, i) => (
              <div key={i} className="mb-1 leading-snug">
                {msg.type === 'message' && (
                  <span>
                    <span className="font-bold cursor-pointer" style={{ color: 'var(--accent)' }} onClick={() => handleUserClick(msg.nick)}>{msg.nick}</span>
                    <span className="text-xs opacity-60"> @{formatTime(msg.ts)}</span>: {msg.text}
                  </span>
                )}
                {msg.type === 'pm' && (
                  <span>
                    <span className="text-[var(--accent)] font-semibold">
                      [PM] {msg.from === savedNick ? `→ ${msg.to}` : `${msg.from} → you`}
                    </span>: {msg.text}
                  </span>
                )}
                {msg.type === 'system' && (
                  <span className="opacity-70">{msg.text}</span>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 p-2 sm:p-3 border-t border-gray-700 bg-[rgba(0,0,0,0.35)]">
            <input
              ref={inputRef}
              className="flex-1 bg-[rgba(0,0,0,0.4)] border border-gray-700 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[var(--accent)] text-[var(--text)]"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Type a message or command..."
              inputMode="text"
              enterKeyHint="send"
            />
            <button className="px-3 py-2 rounded-md text-sm sm:text-base font-semibold" style={{ background: 'var(--accent)', color: '#000' }} onClick={sendMessage}>Send</button>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="sm:w-64 w-full sm:max-w-none flex-shrink-0 overflow-y-auto rounded-lg border border-gray-800 bg-[rgba(0,0,0,0.25)] p-3">
          <div className="mb-2 text-[var(--accent)] font-semibold">Online Users</div>
          <div className="flex flex-wrap sm:flex-col gap-2 sm:gap-1">
            {Object.keys(users).length === 0 && (<div className="text-gray-500 text-sm">No users</div>)}
            {Object.entries(users).map(([username, data]) => (
              <div key={username} onClick={() => handleUserClick(username)} className="cursor-pointer flex items-center justify-between rounded-md px-2 py-1 hover:bg-[rgba(255,255,255,0.05)]">
                <span style={{ color: data.admin ? 'gold' : 'var(--text)' }}>{username === savedNick ? `${username} (you)` : username}</span>
                {unreadPM[username] && (<span className="text-xs bg-[var(--accent)] text-black rounded-full px-2 py-0.5 font-bold">{unreadPM[username]}</span>)}
              </div>
            ))}
          </div>

          <hr className="my-3 border-gray-700" />
          <div>
            <label className="text-sm text-gray-400 mr-2">Theme:</label>
            <select className="bg-[rgba(0,0,0,0.4)] border border-gray-700 rounded px-2 py-1 text-sm" value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="green">Matrix</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>

          {isAdmin && (
            <div className="mt-3">
              <button className="text-xs text-black font-semibold px-3 py-1 rounded" style={{ background: 'var(--accent)' }} onClick={() => socket.send(JSON.stringify({ type: 'clear' }))}>
                Clear Global Chat
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
