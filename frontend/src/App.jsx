import React, { useState, useEffect } from 'react';
import TerminalUI from './components/TerminalUI';

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
  const initialNick = (() => {
    if (typeof window === 'undefined') return '';
    const cookieName = getCookie('terminus_nick');
    if (cookieName) return cookieName;
    return localStorage.getItem('nick') || '';
  })();

  const [nick, setNick] = useState(initialNick);
  const [ws, setWs] = useState(null);

  // Ask for nickname if none
  useEffect(() => {
    if (!nick) {
      let name = '';
      while (!name) {
        name = (prompt('Welcome! What would you like to be called?') || '').trim();
      }
      setNick(name);
      localStorage.setItem('nick', name);
      setCookie('terminus_nick', name, 365);
    }
  }, [nick]);

  // Connect to WebSocket
  useEffect(() => {
    if (!nick) return;
    const backendBase = import.meta.env.VITE_BACKEND_URL || `${location.protocol}//${location.hostname}:3000`;
    const backend = backendBase.replace(/\/$/, '');
    const wsUrl = backend.replace(/^http/, 'ws');

    const socket = new WebSocket(wsUrl);

    socket.addEventListener('open', () => {
      console.log('WebSocket connected to', wsUrl);
      socket.send(JSON.stringify({ type: 'nick', newNick: nick }));
    });

    socket.addEventListener('error', (e) => console.warn('WebSocket error', e));
    socket.addEventListener('close', () => console.log('WebSocket closed'));

    setWs(socket);
    return () => {
      try { socket.close(); } catch {}
      setWs(null);
    };
  }, [nick]);

  const persistNick = (newNick) => {
    setNick(newNick);
    localStorage.setItem('nick', newNick);
    setCookie('terminus_nick', newNick, 365);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'nick', newNick }));
    }
  };

  return (
    <div
      className="flex flex-col min-h-screen w-full overflow-hidden font-mono bg-[#071013] text-[#9db0a5]
                 sm:p-6 p-2"
      style={{
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {nick && ws && (
        <TerminalUI
          socket={ws}
          nick={nick}
          setNick={persistNick}
        />
      )}
    </div>
  );
}
