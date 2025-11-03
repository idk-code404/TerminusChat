import React, { useEffect, useRef, useState } from 'react';

export default function TerminalUI({ socket, nick, setNick }) {
  const [messages, setMessages] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState({});
  const [input, setInput] = useState('');
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [privateChats, setPrivateChats] = useState({});
  const [unread, setUnread] = useState({});
  const chatRef = useRef(null);

  // --- Theme handler ---
  useEffect(() => {
    const root = document.documentElement;
    const themes = {
      dark: {
        '--bg': '#071013',
        '--text': '#9db0a5',
        '--accent': '#00ff6a',
        '--input-bg': '#020807',
      },
      light: {
        '--bg': '#f4f4f4',
        '--text': '#222',
        '--accent': '#007b5e',
        '--input-bg': '#ffffff',
      },
      neon: {
        '--bg': '#050505',
        '--text': '#0affef',
        '--accent': '#00ff9f',
        '--input-bg': '#000814',
      },
    };
    const t = themes[theme] || themes.dark;
    Object.entries(t).forEach(([k, v]) => root.style.setProperty(k, v));
    localStorage.setItem('theme', theme);
  }, [theme]);

  // --- Scroll to bottom on new message ---
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  // --- Handle incoming messages ---
  useEffect(() => {
    if (!socket) return;
    const handleMsg = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.private && msg.to === nick && msg.nick !== nick) {
        setUnread((prev) => ({
          ...prev,
          [msg.nick]: (prev[msg.nick] || 0) + 1,
        }));
        playNotification();
      }
      if (msg.type === 'system' && msg.to && msg.to !== nick) return; // system msgs only for intended user
      setMessages((prev) => [...prev, msg]);
      if (msg.type === 'userlist') {
        const users = {};
        msg.users.forEach((u) => {
          users[u.name] = { admin: u.admin };
        });
        setOnlineUsers(users);
      }
    };
    socket.addEventListener('message', handleMsg);
    return () => socket.removeEventListener('message', handleMsg);
  }, [socket, nick]);

  const playNotification = () => {
    try {
      const audio = new Audio(
        'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQgAAAAA'
      );
      audio.play();
    } catch (e) {}
  };

  // --- Handle commands ---
  const handleCommand = (line) => {
    const parts = line.trim().split(' ');
    const cmd = parts[0].substring(1).toLowerCase();
    const args = parts.slice(1);
    switch (cmd) {
      case 'help':
        addSystemMsg('Commands: /help, /nick <name>, /theme <dark|light|neon>, /msg <user> <message>, /clear');
        break;
      case 'nick':
        if (!args[0]) addSystemMsg('Usage: /nick <newname>');
        else {
          const newNick = args[0];
          socket.send(JSON.stringify({ type: 'nick', newNick }));
          setNick(newNick);
          addSystemMsg(`Your nickname is now ${newNick}`);
        }
        break;
      case 'theme':
        if (['dark', 'light', 'neon'].includes(args[0])) setTheme(args[0]);
        else addSystemMsg('Usage: /theme <dark|light|neon>');
        break;
      case 'msg':
        if (args.length < 2) {
          addSystemMsg('Usage: /msg <user> <message>');
          return;
        }
        const toUser = args[0];
        const text = args.slice(1).join(' ');
        socket.send(JSON.stringify({ type: 'private', to: toUser, text }));
        addPrivateMsg(nick, toUser, text);
        break;
      case 'clear':
        setMessages([]);
        break;
      default:
        addSystemMsg(`Unknown command: ${cmd}`);
    }
  };

  const addSystemMsg = (text) => {
    setMessages((prev) => [...prev, { type: 'system', text, to: nick }]);
  };

  const addPrivateMsg = (from, to, text) => {
    setPrivateChats((prev) => {
      const conv = prev[to] || [];
      return { ...prev, [to]: [...conv, { from, text }] };
    });
  };

  const handleSend = () => {
    if (!input.trim()) return;
    if (input.startsWith('/')) handleCommand(input);
    else socket.send(JSON.stringify({ type: 'message', text: input }));
    setInput('');
  };

  const handleUserClick = (user) => {
    if (user === nick) return;
    setInput(`/msg ${user} `);
    setUnread((prev) => ({ ...prev, [user]: 0 }));
  };

  return (
    <div
      className="flex flex-col h-[100dvh] w-full overflow-hidden"
      style={{
        background: 'var(--bg)',
        color: 'var(--text)',
      }}
    >
      {/* MAIN CHAT AREA */}
      <div
        ref={chatRef}
        className="flex-1 overflow-y-auto p-3 sm:p-4 text-sm sm:text-base"
        style={{
          wordBreak: 'break-word',
          scrollBehavior: 'smooth',
          overscrollBehavior: 'contain',
        }}
      >
        {messages.map((m, i) => {
          if (m.type === 'system')
            return (
              <div key={i} className="text-xs opacity-70">
                [system] {m.text}
              </div>
            );
          if (m.type === 'message')
            return (
              <div key={i}>
                <span
                  className="font-bold cursor-pointer"
                  style={{ color: 'var(--accent)' }}
                  onClick={() => handleUserClick(m.nick)}
                >
                  {m.nick}
                </span>
                : {m.text}
              </div>
            );
          if (m.type === 'private')
            return (
              <div key={i}>
                <span
                  className="font-bold cursor-pointer"
                  style={{ color: 'var(--accent)' }}
                  onClick={() => handleUserClick(m.nick)}
                >
                  [PM] {m.nick}
                </span>
                : {m.text}
              </div>
            );
          return null;
        })}
      </div>

      {/* INPUT BAR */}
      <div
        className="flex gap-2 p-2 sm:p-3 border-t border-[#0a1a17]"
        style={{ background: 'var(--input-bg)' }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Type a message or command..."
          className="flex-1 bg-transparent outline-none text-[var(--text)] placeholder-[#888] text-sm sm:text-base"
          inputMode="text"
          enterKeyHint="send"
        />
        <button
          onClick={handleSend}
          className="px-4 py-2 rounded bg-[var(--accent)] text-black font-bold active:scale-95 transition"
        >
          Send
        </button>
      </div>

      {/* USER LIST PANEL (BOTTOM ON MOBILE, SIDE ON DESKTOP) */}
      <div className="absolute top-2 right-2 sm:right-4 sm:top-4 bg-[var(--input-bg)] p-2 rounded-md border border-[#0a1a17] max-h-[60vh] sm:max-h-[70vh] overflow-y-auto text-xs sm:text-sm">
        <div className="font-bold mb-2 text-[var(--accent)]">Online Users</div>
        {Object.entries(onlineUsers).map(([u, data]) => (
          <div
            key={u}
            onClick={() => handleUserClick(u)}
            className="cursor-pointer flex justify-between items-center py-1 hover:opacity-80"
          >
            <span>
              {u === nick ? <strong>{u} (you)</strong> : u}{' '}
              {data.admin && <span className="text-[var(--accent)]">(admin)</span>}
            </span>
            {unread[u] > 0 && (
              <span className="ml-2 bg-[var(--accent)] text-black rounded-full px-2 text-xs">
                {unread[u]}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
