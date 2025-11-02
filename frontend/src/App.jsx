import React, { useState, useEffect } from 'react'
import TerminalUI from './components/TerminalUI'

export default function App() {
  const [nick, setNick] = useState('guest')
  const [ws, setWs] = useState(null)

  useEffect(() => {
    // Safeguard for SSR environments
    if (typeof window === 'undefined') return

    // Build backend base from env var or fallback to localhost
    const backendBase = import.meta.env.VITE_BACKEND_URL || `${location.protocol}//${location.hostname}:3000`
    const backend = backendBase.replace(/\/$/, '') // remove trailing slash
    const wsUrl = backend.replace(/^http/, 'ws')   // http(s) -> ws(s)

    const socket = new WebSocket(wsUrl)

    const handleOpen = () => console.log('ws open', wsUrl)
    const handleError = (ev) => console.warn('ws error', ev)
    const handleClose = (ev) => console.log('ws closed', ev)

    socket.addEventListener('open', handleOpen)
    socket.addEventListener('error', handleError)
    socket.addEventListener('close', handleClose)

    setWs(socket)

    // Cleanup on unmount
    return () => {
      socket.removeEventListener('open', handleOpen)
      socket.removeEventListener('error', handleError)
      socket.removeEventListener('close', handleClose)
      try { socket.close() } catch (e) { /* ignore */ }
      setWs(null)
    }
  }, []) // run once

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
  )
}
