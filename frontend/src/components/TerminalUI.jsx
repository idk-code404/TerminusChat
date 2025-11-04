import React, { useState, useEffect, useRef } from "react";

export default function TerminalUI({ socket, nick, setNick }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "matrix");
  const [connected, setConnected] = useState(false);
  const [backend] = useState(import.meta.env.VITE_BACKEND_URL || `${location.protocol}//${location.hostname}:3000`);
  const bottomRef = useRef();

  // Themes
  const themes = {
    matrix: { bg: "#071013", text: "#00ff6a", accent: "#00b35f" },
    dark: { bg: "#0a0a0a", text: "#e0e0e0", accent: "#6aff9c" },
    cyber: { bg: "#020817", text: "#03edf9", accent: "#7df9ff" },
  };

  // Ask for nickname on first load
  useEffect(() => {
    const saved = localStorage.getItem("nick");
    if (saved) {
      setNick(saved);
    } else {
      const name = prompt("Welcome! What would you like to be called?") || `Guest${Math.floor(Math.random() * 1000)}`;
      localStorage.setItem("nick", name);
      setNick(name);
    }
  }, []);

  // Connect WebSocket
  useEffect(() => {
    if (!socket) return;
    socket.onopen = () => {
      console.log("✅ Connected to TerminusChat server");
      setConnected(true);
    };
    socket.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "history") setMessages(data.history);
        else if (data.type === "chat" || data.type === "system" || data.type === "file")
          setMessages((prev) => [...prev, data]);
        else if (data.type === "userList") setUsers(data.users);
      } catch (err) {
        console.warn("Bad WS data:", e.data);
      }
    };
    socket.onclose = () => setConnected(false);
  }, [socket]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Send chat command or message
  const sendMessage = () => {
    if (!input.trim() || !socket) return;
    socket.send(JSON.stringify({ type: "chat", message: input }));
    setInput("");
  };

  // Handle Enter
  const handleKeyDown = (e) => {
    if (e.key === "Enter") sendMessage();
  };

  // File upload
  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("nick", nick);
    try {
      const res = await fetch(`${backend}/upload`, { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) {
        console.log("Uploaded:", data.fileUrl);
      } else {
        alert("Upload failed");
      }
    } catch (err) {
      console.error("Upload failed:", err);
    }
  }

  // Theme changer
  const handleThemeChange = (e) => {
    const t = e.target.value;
    setTheme(t);
    localStorage.setItem("theme", t);
  };

  const style = themes[theme] || themes.matrix;

  return (
    <div
      className="flex flex-col w-full h-screen p-2 sm:p-4"
      style={{ backgroundColor: style.bg, color: style.text, fontFamily: "monospace" }}
    >
      {/* Users sidebar */}
      <div className="flex flex-col sm:flex-row h-full gap-2">
        <div
          className="sm:w-64 w-full sm:h-full h-32 overflow-y-auto border border-gray-700 p-2 rounded"
          style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
        >
          <div className="font-bold text-[0.9rem]" style={{ color: style.accent }}>
            Online Users ({users.length})
          </div>
          {users.map((u, i) => (
            <div
              key={i}
              className="cursor-pointer hover:underline"
              onClick={() => setInput(`/msg ${u.nick} `)}
              style={{ color: u.admin ? style.accent : style.text }}
            >
              {u.nick} {u.admin ? "(Admin)" : ""}
            </div>
          ))}
        </div>

        {/* Chat Area */}
        <div className="flex flex-col flex-1 border border-gray-700 rounded p-2 overflow-hidden">
          <div className="flex justify-between items-center mb-2 text-sm">
            <div>
              {connected ? (
                <span style={{ color: style.accent }}>● Connected</span>
              ) : (
                <span className="text-red-400">● Disconnected</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm">Theme:</label>
              <select
                value={theme}
                onChange={handleThemeChange}
                className="bg-transparent border border-gray-600 rounded text-sm p-1"
              >
                {Object.keys(themes).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <label htmlFor="fileInput" className="cursor-pointer text-green-400 hover:text-green-300">
                📎
              </label>
              <input type="file" id="fileInput" className="hidden" onChange={handleFileUpload} />
            </div>
          </div>

          {/* Chat history */}
          <div className="flex-1 overflow-y-auto text-sm space-y-1 p-1">
            {messages.map((msg, i) => {
              if (msg.type === "system") {
                return (
                  <div key={i} className="text-yellow-400">
                    [system] {msg.message}
                  </div>
                );
              } else if (msg.type === "file") {
                return (
                  <div key={i} className="text-blue-400 break-words">
                    [File] <b>{msg.nick}</b>:{" "}
                    <a
                      href={`${backend}${msg.fileUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      {msg.fileName}
                    </a>
                  </div>
                );
              } else {
                return (
                  <div key={i}>
                    <b>{msg.nick}</b>: {msg.message}
                  </div>
                );
              }
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent border border-gray-600 rounded p-2 text-sm outline-none"
              placeholder="Type message or /help"
              style={{ color: style.text }}
            />
            <button
              onClick={sendMessage}
              className="px-4 py-2 rounded border border-gray-600 hover:bg-gray-700 text-sm"
              style={{ color: style.accent }}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
