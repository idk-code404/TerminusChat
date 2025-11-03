import React, { useState, useEffect } from 'react';
import TerminalUI from './components/TerminalUI';

/* Cookie helpers */
function setCookie(name, value, days = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}
function getCookie(name) {
  return document.cookie.split('; ').reduce((r, v) => {
    const parts = v.split('=');
    return parts[0] === encodeURIComponent(name) ? decodeURIComponent(parts.slice(1).join('=')) : r;
  }, '');
}

export default function App() {
  // prefer cookie, then localStorage
  const initialNick = (() => {
    if (typeof window === 'undefined') return '';
    const cookieName = getCookie('terminus_nick');
    if (cookieName) return cookieName;
    return localStorage.getItem('nick') || '';
  })();

  const [nick, setNick] = useState(initialNick);
  const [ws, setWs] = useState(null);

  // Prompt for nickname if not set
  useEffect(() => {
    if (!nick) {
      let name = '';
      while (!name) {
        // use prompt for simplicity; replace with modal if you prefer
        name = (prompt('Welcome! What would you like to be called?') || '').trim();
      }
      setNick(name);
      localStorage.setItem('nick', name);
      setCookie('terminus_nick', name, 365);
    }
  }, [nick]);

  // Open WebSocket connection after nick is set
  useEffect(() => {
    if (!nick) return;
    const backendBase = import.meta.env.VITE_BACKEND_URL || `${location.protocol}//${location.hostname}:3000`;
    const backend = backendBase.replace(/\/$/, '');
    const wsUrl = backend.replace(/^http/, 'ws');

    const socket = new WebSocket(wsUrl);

    const onOpen = () => {
      console.log('WebSocket connected to', wsUrl);
      // announce nick to server
      try { socket.send(JSON.stringify({ type: 'nick', newNick: nick })); } catch {}
    };
    const onError = (e) => console.warn('WebSocket error', e);
    const onClose = () => console.log('WebSocket closed');

    socket.addEventListener('open', onOpen);
    socket.addEventListener('error', onError);
    socket.addEventListener('close', onClose);

    setWs(socket);

    return () => {
      socket.removeEventListener('open', onOpen);
      socket.removeEventListener('error', onError);
      socket.removeEventListener('close', onClose);
      try { socket.close(); } catch {}
      setWs(null);
    };
  }, [nick]);

  // Keep setNick wrapper to persist to both storages
  const persistNick = (newNick) => {
    setNick(newNick);
    try { localStorage.setItem('nick', newNick); } catch {}
    try { setCookie('terminus_nick', newNick, 365); } catch {}
    // if ws open, notify server
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: 'nick', newNick })); } catch {}
    }
  };

  return (
    <div className="min-h-screen bg-[#071013] text-[#9db0a5] p-6 font-mono">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center gap-4 mb-6">
          <div className="bg-[#061010] text-[#00ff6a] px-3 py-2 rounded">terminus</div>
          <h1 className="text-lg">TerminusChat</h1>
        </header>

        {/* render TerminalUI when nickname and ws exist */}
        {nick && ws && (
          <TerminalUI
            socket={ws}
            nick={nick}
            setNick={persistNick} /* use wrapper so all changes persist */
          />
        )}
      </div>
    </div>
  );
}
