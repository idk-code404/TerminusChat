import React, { useState, useEffect, useRef } from "react";

export default function TerminalUI({ socket, nick, setNick }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [userList, setUserList] = useState([]);
  const [theme, setTheme] = useState(
    localStorage.getItem("theme") || "dark"
  );
  const chatRef = useRef(null);
  const clientId = useRef(Math.random().toString(36).substring(2));

  useEffect(() => {
    if (!socket) return;
    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "welcome") {
        addMessage("system", msg.text);
      } else if (msg.type === "system") {
        addMessage("system", msg.text);
      } else if (msg.type === "chat") {
        addMessage(msg.user, msg.text);
      } else if (msg.type === "file") {
        addMessage(
          msg.user,
          `[File] ${msg.filename} (${(msg.size / 1024 / 1024).toFixed(
            2
          )} MB): `,
          msg.url
        );
      } else if (msg.type === "history") {
        msg.data.forEach((entry) => {
          if (entry.type === "chat")
            addMessage(entry.user, entry.text, null, false);
          else if (entry.type === "file")
            addMessage(entry.user, `[File] ${entry.filename}`, entry.url, false);
        });
      } else if (msg.type === "userlist") {
        setUserList(msg.data);
      } else if (msg.type === "clearchat") {
        setMessages([]);
      }
    };
  }, [socket]);

  useEffect(() => {
    if (chatRef.current)
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  const addMessage = (user, text, link = null, append = true) => {
    const entry = { user, text, link, time: new Date().toLocaleTimeString() };
    if (append) setMessages((m) => [...m, entry]);
    else setMessages((m) => [...m, entry]);
  };

  const sendMessage = () => {
    if (!input.trim()) return;
    if (input.startsWith("/")) {
      socket.send(JSON.stringify({ type: "command", text: input }));
    } else {
      socket.send(JSON.stringify({ type: "chat", text: input }));
    }
    setInput("");
  };

  const uploadFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`/upload?user=${nick}`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (data.error) alert(data.error);
  };

  const changeTheme = (t) => {
    setTheme(t);
    localStorage.setItem("theme", t);
  };

  const themeClasses =
    theme === "dark"
      ? "bg-[#0a0a0a] text-[#00ff6a]"
      : theme === "light"
      ? "bg-[#fafafa] text-[#111]"
      : "bg-[#001a1a] text-[#00ffaa]";

  return (
    <div
      className={`${themeClasses} flex flex-col min-h-screen p-3 transition-all duration-300`}
    >
      <div className="flex justify-between mb-2">
        <div>
          <select
            value={theme}
            onChange={(e) => changeTheme(e.target.value)}
            className="bg-transparent border border-gray-600 p-1 rounded"
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="terminal">Terminal Green</option>
          </select>
        </div>
        <div className="text-sm opacity-75">{nick}</div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div
          ref={chatRef}
          className="flex-1 overflow-y-auto border border-gray-700 p-2 rounded"
        >
          {messages.map((m, i) => (
            <div key={i} className="mb-1 break-words">
              <span className="opacity-70 mr-1">[{m.time}]</span>
              <b>{m.user}</b>:{" "}
              {m.link ? (
                <a
                  href={m.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-blue-400"
                >
                  {m.text}
                </a>
              ) : (
                m.text
              )}
            </div>
          ))}
        </div>

        <div className="hidden md:flex flex-col w-48 border-l border-gray-700 p-2">
          <h3 className="font-bold mb-2 text-sm">Online Users</h3>
          {userList.map((u, i) => (
            <div key={i} className="text-sm">
              {u.nick} {u.isAdmin ? "(admin)" : ""}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 flex gap-2">
        <input
          className="flex-1 p-2 rounded bg-transparent border border-gray-600"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Type a message or command..."
        />
        <input type="file" onChange={uploadFile} className="hidden" id="fileup" />
        <label
          htmlFor="fileup"
          className="cursor-pointer border border-gray-600 px-3 py-2 rounded"
        >
          📁
        </label>
      </div>
    </div>
  );
}
