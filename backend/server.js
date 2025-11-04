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

function getOrCreateClientId() {
  if (typeof window === 'undefined') return null;
  const key = 'terminus_clientId';
  let id = localStorage.getItem(key);
  if (!id) {
    // crypto.randomUUID is best; fallback to random hex
    try {
      id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : null;
    } catch {}
    if (!id) id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(key, id);
  }
  return id;
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
  const clientId = getOrCreateClientId();

  // ensure user picks a name if none
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

  useEffect(() => {
    if (!nick) return;
    const backendBase = import.meta.env.VITE_BACKEND_URL || `${location.protocol}//${location.hostname}:3000`;
    const backend = backendBase.replace(/\/$/, '');
    const wsUrl = backend.replace(/^http/, 'ws');

    const socket = new WebSocket(wsUrl);

    const onOpen = () => {
      console.log('WebSocket connected to', wsUrl);
      // send identify message so server can persist the nick under clientId
      try {
        socket.send(JSON.stringify({ type: 'identify', clientId, nick }));
      } catch (e) {
        console.warn('failed to send identify', e);
      }
    };

    socket.addEventListener('open', onOpen);
    socket.addEventListener('error', (e) => console.warn('WebSocket error', e));
    socket.addEventListener('close', () => console.log('WebSocket closed'));

    setWs(socket);
    return () => {
      socket.removeEventListener('open', onOpen);
      try { socket.close(); } catch {}
      setWs(null);
    };
  }, [nick, clientId]);

  // when user changes nick via UI, persist locally and inform server
  const persistNick = (newNick) => {
    const safe = (newNick || '').toString().trim().substring(0, 48);
    setNick(safe);
    try { localStorage.setItem('nick', safe); } catch {}
    try { setCookie('terminus_nick', safe, 365); } catch {}
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: 'nick', newNick: safe })); } catch {}
      // also re-identify with same clientId so server stores mapping
      try { ws.send(JSON.stringify({ type: 'identify', clientId, nick: safe })); } catch {}
    }
  };

  return (
    <div className="flex flex-col min-h-screen w-full overflow-hidden font-mono bg-[#071013] text-[#9db0a5] p-2">
      {nick && ws && <TerminalUI socket={ws} nick={nick} setNick={persistNick} />}
    </div>
  );
}
