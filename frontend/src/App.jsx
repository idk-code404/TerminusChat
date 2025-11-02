import React, { useState, useEffect, useRef } from 'react'
import TerminalUI from './components/TerminalUI'

export default function App(){
  const [nick, setNick] = useState('guest');
  const [ws, setWs] = useState(null);

  useEffect(()=>{
    // open WSS connection
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.hostname}:3000`;
    const socket = new WebSocket(url);
    socket.addEventListener('open', ()=> console.log('ws open'));
    socket.addEventListener('error', (e)=> console.warn('ws error', e));
    setWs(socket);
    return ()=> socket.close();
  },[]);

  return (
    <div className="min-h-screen bg-[#071013] text-[#9db0a5] p-6 font-mono">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center gap-4 mb-6">
          <div className="bg-[#061010] text-[#00ff6a] px-3 py-2 rounded">terminus</div>
          <h1 className="text-lg">TerminusChat</h1>
        </header>

        <TerminalUI socket={ws} nick={nick} setNick={setNick} />
      </div>
    </div>
    // inside App.jsx useEffect
const backendBase = import.meta.env.VITE_BACKEND_URL || `${location.protocol}//${location.hostname}:3000`;
const backend = backendBase.replace(/\/$/, '');
const wsUrl = backend.replace(/^http/, 'ws');
const socket = new WebSocket(wsUrl);
  )
}
