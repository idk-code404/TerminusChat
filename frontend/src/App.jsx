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
  // Load nickname from cookie or localStorage
  const initialNick = (() => {
    if (typeof window === 'undefined') return '';
    const cookieName = getCookie('terminus_nick');
    if (cookieName) return cookieName;
    return localStorage.getItem('nick') || '';
  })();

  const [nick, setNick] = useState(initialNick);
  const [ws, setWs] = useState(null);

  // Ask user for nickname if not set
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

  // Connect to WebSocket server
  useEffect(() => {
    if (!nick) return;

    const backendBase = import.meta.env.VITE_BACKEND_URL || `${location.protocol}//${location.hostname}:3000`;
    const backend = backendBase.replace(/\/$/, '');
    const wsUrl = backend.replace(/^http/, 'ws');

    const socket = new WebSocket(wsUrl);

    socket.addEventListener('open', () => {
      console.log('WebSocket connected to', wsUrl);
      // Just send the nick to server — no local "[system]" echo
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

  // Persist nick and sync with server
  const persistNick = (newNick) => {
    setNick(newNick);
    localStorage.setItem('nick', newNick);
    setCookie('terminus_nick', newNick, 365);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'nick', newNick }));
    }
  };

  return (
    <div className="min-h-screen bg-[#071013] text-[#9db0a5] font-mono flex flex-col">
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
