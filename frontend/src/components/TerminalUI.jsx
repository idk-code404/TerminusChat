import React, { useState, useEffect, useRef } from "react";

export default function TerminalUI({ socket, nick, setNick }) {
  const [messages, setMessages] = useState([]);
  const [privateMessages, setPrivateMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [input, setInput] = useState("");
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "green");
  const [unreadPM, setUnreadPM] = useState({});
  const [activeTab, setActiveTab] = useState("global");
  const [pmTarget, setPmTarget] = useState("");
  const messagesEndRef = useRef(null);

  // Load nickname from localStorage or prompt on first visit
  useEffect(() => {
    const storedNick = localStorage.getItem("nickname");
    if (!storedNick) {
      const newNick = prompt("What would you like to be called?")?.trim() || "Guest";
      setNick(newNick);
      localStorage.setItem("nickname", newNick);
      socket?.send(JSON.stringify({ type: "setNick", nick: newNick }));
    } else {
      setNick(storedNick);
      socket?.send(JSON.stringify({ type: "setNick", nick: storedNick }));
    }
  }, [socket]);

  // Handle WebSocket messages
  useEffect(() => {
    if (!socket) return;

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "chat" || data.type === "system") {
        setMessages((prev) => [...prev, data]);
      } else if (data.type === "privateMessage") {
        setPrivateMessages((prev) => [...prev, data]);

        if (data.from !== nick && !data.self) {
          setUnreadPM((prev) => ({
            ...prev,
            [data.from]: (prev[data.from] || 0) + 1,
          }));
        }
      } else if (data.type === "history") {
        setMessages(data.history);
      } else if (data.type === "privateHistory") {
        setPrivateMessages(data.history);
      } else if (data.type === "userList") {
        setUsers(data.users);
      }
    };
  }, [socket, nick]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, privateMessages, activeTab]);

  // Handle message sending
  const sendMessage = () => {
    if (!input.trim()) return;

    if (input.startsWith("/")) {
      socket.send(JSON.stringify({ type: "chat", message: input }));
    } else if (activeTab === "private" && pmTarget) {
      socket.send(JSON.stringify({ type: "chat", message: `/msg ${pmTarget} ${input}` }));
    } else {
      socket.send(JSON.stringify({ type: "chat", message: input }));
    }
    setInput("");
  };

  // Handle theme changes
  const themes = {
    green: "bg-[#071013] text-[#00ff6a]",
    white: "bg-[#101010] text-[#f0f0f0]",
    blue: "bg-[#0b1d33] text-[#00baff]",
  };

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
  };

  // Click-to-PM handler
  const startPrivateMessage = (targetNick) => {
    if (targetNick === nick) return;
    setActiveTab("private");
    setPmTarget(targetNick);
    setUnreadPM((prev) => ({ ...prev, [targetNick]: 0 }));
  };

  // Format timestamps
  const formatTime = (t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className={`flex flex-col h-screen p-2 md:p-4 ${themes[theme]} font-mono`}>
      {/* Top controls */}
      <div className="flex justify-between items-center mb-2 text-sm">
        <div className="flex gap-2">
          <button
            className={`px-2 py-1 rounded ${activeTab === "global" ? "bg-green-600" : "bg-gray-800"}`}
            onClick={() => setActiveTab("global")}
          >
            Global
          </button>
          <button
            className={`px-2 py-1 rounded ${activeTab === "private" ? "bg-green-600" : "bg-gray-800"}`}
            onClick={() => setActiveTab("private")}
          >
            Private {Object.values(unreadPM).reduce((a, b) => a + b, 0) > 0 && (
              <span className="ml-1 text-red-400">
                ({Object.values(unreadPM).reduce((a, b) => a + b, 0)})
              </span>
            )}
          </button>
        </div>

        <select
          className="bg-transparent border border-gray-700 rounded px-2 py-1 text-xs"
          value={theme}
          onChange={(e) => handleThemeChange(e.target.value)}
        >
          <option value="green">Green</option>
          <option value="white">White</option>
          <option value="blue">Blue</option>
        </select>
      </div>

      {/* Chat container */}
      <div className="flex flex-1 min-h-0 gap-3">
        {/* Message Area */}
        <div className="flex flex-col flex-1 overflow-y-auto border border-gray-700 rounded p-2 text-sm">
          {(activeTab === "global" ? messages : privateMessages)
            .map((msg, i) => (
              <div key={i} className="mb-1">
                {msg.type === "system" ? (
                  <div className="text-gray-500">[system] {msg.message}</div>
                ) : msg.self ? (
                  <div className="text-green-400">
                    [You → {msg.to}] {msg.message}
                  </div>
                ) : msg.to ? (
                  <div className="text-yellow-400">
                    [{msg.from} → You] {msg.message}
                  </div>
                ) : (
                  <div>
                    <span className="text-green-500">{msg.nick}</span>
                    <span className="text-gray-500"> [{formatTime(msg.time)}]</span>: {msg.message}
                  </div>
                )}
              </div>
            ))}
          <div ref={messagesEndRef} />
        </div>

        {/* User List */}
        <div className="hidden md:flex flex-col w-40 border border-gray-700 rounded p-2 overflow-y-auto text-xs">
          <div className="mb-2 text-gray-400">Online Users:</div>
          {users.map((u, i) => (
            <div
              key={i}
              onClick={() => startPrivateMessage(u.nick)}
              className={`cursor-pointer hover:text-green-400 ${
                u.nick === pmTarget ? "text-green-500" : ""
              }`}
            >
              {u.nick} {u.admin && <span className="text-red-400">(Admin)</span>}
              {unreadPM[u.nick] > 0 && (
                <span className="ml-1 text-red-400">[{unreadPM[u.nick]}]</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="flex mt-2 gap-2 text-sm">
        {activeTab === "private" && pmTarget && (
          <div className="px-2 py-1 bg-gray-800 rounded text-gray-300">
            To: <span className="text-green-400">{pmTarget}</span>
          </div>
        )}
        <input
          className="flex-1 bg-transparent border border-gray-700 rounded px-2 py-1 outline-none"
          placeholder={
            activeTab === "private" && pmTarget
              ? "Type private message..."
              : "Type your message..."
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        />
        <button
          onClick={sendMessage}
          className="bg-green-700 hover:bg-green-600 text-black px-3 py-1 rounded"
        >
          Send
        </button>
      </div>

      {/* Mobile user list */}
      <div className="md:hidden mt-3">
        <div className="text-gray-400 text-xs mb-1">Online:</div>
        <div className="flex flex-wrap gap-2">
          {users.map((u, i) => (
            <div
              key={i}
              onClick={() => startPrivateMessage(u.nick)}
              className="cursor-pointer hover:text-green-400"
            >
              {u.nick}
              {unreadPM[u.nick] > 0 && (
                <span className="ml-1 text-red-400">[{unreadPM[u.nick]}]</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
