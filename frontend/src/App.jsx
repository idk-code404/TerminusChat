import React, { useState, useEffect } from 'react';
import TerminalUI from './components/TerminalUI';

export default function App() {
  // Load nick from localStorage or empty string
  const [nick, setNick] = useState(localStorage.getItem('nick') || '');
  const [ws, setWs] = useState(null);

  // Prompt for nickname if not set
  useEffect(() => {
    if (!nick) {
      let name = '';
      while (!name) {
        name = prompt("Welcome! What would you like to be called?")?.trim() || '';
      }
      setNick(name);
      localStorage.setItem('nick', name);
    }
  }, [nick]);

  // Open WebSocket connection
  useEffect(() => {
    if (!nick) return; // wait for nick before connecting
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.hostname}:3000`;
    const socket = new WebSocket(url);

    socket.addEventListener('open', () => console.log('WebSocket connected'));
    socket.addEventListener('error', (e) => console.warn('WebSocket error', e));

    // Send initial nick to server
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ type: 'nick', newNick: nick }));
    });

    setWs(socket);

    return () => socket.close();
  }, [nick]);

  return (
    <div className="min-h-screen bg-[#071013] text-[#9db0a5] p-6 font-mono">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center gap-4 mb-6">
          <div className="bg-[#061010] text-[#00ff6a] px-3 py-2 rounded">terminus</div>
          <h1 className="text-lg">TerminusChat</h1>
        </header>

        {/* Only render TerminalUI when nickname and WS connection are ready */}
        {nick && ws && (
          <TerminalUI
            socket={ws}
            nick={nick}
            setNick={(newNick) => {
              setNick(newNick);
              localStorage.setItem('nick', newNick);
            }}
          />
        )}
      </div>
    </div>
  );
}
