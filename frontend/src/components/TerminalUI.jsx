import React, { useState, useEffect, useRef } from 'react';

export default function TerminalUI({ socket, nick, setNick }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'matrix');
  const chatRef = useRef(null);

  const themes = {
    matrix: { bg: '#000', text: '#00ff6a' },
    hacker: { bg: '#111', text: '#39ff14' },
    classic: { bg: '#071013', text: '#9db0a5' },
    neon: { bg: '#0f0f23', text: '#00ffff' },
  };

  // Apply theme
  useEffect(() => {
    const t = themes[theme];
    document.body.style.background = t.bg;
    document.body.style.color = t.text;
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!socket) return;
    const onMessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'chat') setMessages(m => [...m, { nick: data.nick, msg: data.msg }]);
      else if (data.type === 'pm') setMessages(m => [...m, { nick: `(PM) ${data.from}`, msg: data.msg }]);
      else if (data.type === 'clear') setMessages([]);
      else if (data.type === 'system') setMessages(m => [...m, { nick: 'system', msg: data.msg }]);
      else if (data.type === 'userlist') setUsers(data.users);
    };
    socket.addEventListener('message', onMessage);
    return () => socket.removeEventListener('message', onMessage);
  }, [socket]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = () => {
    const cmd = input.trim();
    if (!cmd) return;

    if (cmd.startsWith('/nick ')) {
      const newNick = cmd.slice(6).trim();
      if (newNick) {
        socket.send(JSON.stringify({ type: 'nick', newNick }));
        setNick(newNick);
      }
    } else if (cmd.startsWith('/msg ')) {
      const parts = cmd.split(' ');
      const to = parts[1];
      const msg = parts.slice(2).join(' ');
      socket.send(JSON.stringify({ type: 'pm', to, msg }));
    } else if (cmd.startsWith('/login ')) {
      const key = cmd.split(' ')[1];
      socket.send(JSON.stringify({ type: 'login', key }));
    } else if (cmd === '/logout') {
      socket.send(JSON.stringify({ type: 'logout' }));
    } else if (cmd === '/clear') {
      socket.send(JSON.stringify({ type: 'clear' }));
    } else if (cmd.startsWith('/bug ')) {
      const report = cmd.slice(5).trim();
      if (report.length < 5) {
        addSystemMessage('Please describe the issue (at least 5 characters).');
      } else {
        socket.send(JSON.stringify({ type: 'bug', report }));
        addSystemMessage('Submitting bug report...');
      }
    } else {
      socket.send(JSON.stringify({ type: 'chat', msg: cmd }));
    }

    setInput('');
  };

  const addSystemMessage = (msg) => {
    setMessages(m => [...m, { nick: 'system', msg }]);
  };

  const themeBtn = (
    <select
      value={theme}
      onChange={(e) => setTheme(e.target.value)}
      className="bg-transparent border border-[#00ff6a] text-sm p-1 rounded"
    >
      {Object.keys(themes).map(k => (
        <option key={k} value={k}>{k}</option>
      ))}
    </select>
  );

  return (
    <div className="flex flex-col md:flex-row gap-4 h-[calc(100vh-2rem)]">
      {/* Chat Area */}
      <div
        ref={chatRef}
        className="flex-1 overflow-y-auto p-3 border border-[#00ff6a] rounded bg-opacity-10"
        style={{ background: `${themes[theme].bg}f2`, color: themes[theme].text }}
      >
        {messages.map((m, i) => (
          <div key={i}>
            <span className="font-bold">{m.nick}</span>: {m.msg}
          </div>
        ))}
      </div>

      {/* Sidebar */}
      <div className="w-full md:w-60 border border-[#00ff6a] rounded p-2 flex flex-col justify-between">
        <div className="overflow-y-auto mb-3">
          <h2 className="text-sm mb-2 text-[#00ff6a]">Online Users</h2>
          {users.map((u, i) => (
            <div
              key={i}
              onClick={() => setInput(`/msg ${u.nick} `)}
              className="cursor-pointer hover:underline"
            >
              {u.nick}{u.admin ? ' (admin)' : ''}
            </div>
          ))}
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-[#00ff6a]">Theme:</span>
          {themeBtn}
        </div>
      </div>

      {/* Input */}
      <div className="absolute bottom-0 left-0 w-full p-3 bg-opacity-30 backdrop-blur-sm">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Type a message or command..."
          className="w-full bg-transparent outline-none border border-[#00ff6a] rounded p-2 text-sm"
        />
      </div>
    </div>
  );
}
