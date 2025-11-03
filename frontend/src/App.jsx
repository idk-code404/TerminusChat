import React, { useState, useEffect } from 'react';
import TerminalUI from './components/TerminalUI';

export default function App() {
  const [nick, setNick] = useState(() => {
    // Restore saved nickname from localStorage
    return localStorage.getItem('nick') || '';
  });

  const [socket, setSocket] = useState(null);

  // Prompt for nickname if not already set
  useEffect(() => {
    if (!nick) {
      const name = prompt("What would you like to be called?") || `guest${Math.floor(Math.random()*1000)}`;
      setNick(name);
      localStorage.setItem('nick', name);
    }
  }, [nick]);

  // WebSocket connection
  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.hostname}:3000`;
    const ws = new WebSocket(url);

    ws.addEventListener('open', () => console.log('WebSocket connected'));
    ws.addEventListener('error', (e) => console.warn('WebSocket error', e));
    setSocket(ws);

    return () => ws.close();
  }, []);

  // Save nickname changes to localStorage
  useEffect(() => {
    if (nick) localStorage.setItem('nick', nick);
  }, [nick]);

  return (
    <div className="min-h-screen bg-[#071013] text-[#9db0a5] p-2 sm:p-6 font-mono">
      {socket && <TerminalUI socket={socket} nick={nick} setNick={setNick} />}
    </div>
  );
}
