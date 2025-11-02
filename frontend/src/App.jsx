import React, { useState, useEffect } from "react";
import TerminalUI from "./components/TerminalUI";

export default function App() {
  // restore nick + admin from localStorage
  const [nick, setNick] = useState(localStorage.getItem("nick") || "guest");
  const [isAdmin, setIsAdmin] = useState(localStorage.getItem("isAdmin") === "true");
  const [ws, setWs] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // build backend URL
    const backendBase =
      import.meta.env.VITE_BACKEND_URL ||
      `${location.protocol}//${location.hostname}:3000`;
    const backend = backendBase.replace(/\/$/, "");
    const wsUrl = backend.replace(/^http/, "ws");

    const socket = new WebSocket(wsUrl);

    const handleOpen = () => console.log("🟢 Connected to", wsUrl);
    const handleError = (e) => console.warn("WebSocket error:", e);
    const handleClose = () => console.log("🔴 Disconnected");

    socket.addEventListener("open", handleOpen);
    socket.addEventListener("error", handleError);
    socket.addEventListener("close", handleClose);

    // Listen for server messages related to admin login/logout
    socket.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "admin-status") {
          setIsAdmin(msg.value);
          localStorage.setItem("isAdmin", msg.value);
        }
      } catch {}
    });

    setWs(socket);

    return () => {
      socket.removeEventListener("open", handleOpen);
      socket.removeEventListener("error", handleError);
      socket.removeEventListener("close", handleClose);
      socket.close();
      setWs(null);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#071013] text-[#9db0a5] p-6 font-mono">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center gap-4 mb-6">
          <div className="bg-[#061010] text-[#00ff6a] px-3 py-2 rounded">terminus</div>
          <h1 className="text-lg">TerminusChat</h1>
          {isAdmin && (
            <span className="ml-4 text-[#00ff6a] text-sm border border-green-600 rounded px-2 py-1">
              ADMIN MODE
            </span>
          )}
        </header>

        <TerminalUI socket={ws} nick={nick} setNick={setNick} isAdmin={isAdmin} />
      </div>
    </div>
  );
}
