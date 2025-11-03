import React, { useState, useEffect, useRef } from "react";

export default function TerminalUI({ socket, nick, setNick }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "green");
  const [users, setUsers] = useState([]);
  const [unreadPMs, setUnreadPMs] = useState({});
  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const themes = {
    green: { bg: "#000000", text: "#00FF66", accent: "#00CC55" },
    blue: { bg: "#0A0F1F", text: "#00BFFF", accent: "#0077FF" },
    gray: { bg: "#101010", text: "#CCCCCC", accent: "#AAAAAA" },
    cyber: { bg: "#050018", text: "#39FF14", accent: "#0FF" },
  };

  const currentTheme = themes[theme];

  useEffect(() => {
    document.body.style.backgroundColor = currentTheme.bg;
    document.body.style.color = currentTheme.text;
  }, [theme]);

  // Scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle incoming WebSocket messages
  useEffect(() => {
    if (!socket) return;

    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "message" || msg.type === "private" || msg.type === "file") {
        setMessages((prev) => [...prev, msg]);

        // Track unread PMs
        if (msg.type === "private" && msg.from !== nick) {
          setUnreadPMs((prev) => ({
            ...prev,
            [msg.from]: (prev[msg.from] || 0) + 1,
          }));
        }
      } else if (msg.type === "system" && msg.selfOnly !== true) {
        setMessages((prev) => [...prev, { from: "[system]", text: msg.text }]);
      } else if (msg.type === "userlist") {
        setUsers(msg.users);
      }
    };
  }, [socket, nick]);

  const sendMessage = (text) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    if (text.startsWith("/")) {
      handleCommand(text);
    } else {
      socket.send(JSON.stringify({ type: "message", text }));
    }

    setInput("");
  };

  const handleCommand = (cmd) => {
    const args = cmd.split(" ");
    const base = args[0].toLowerCase();

    switch (base) {
      case "/nick":
        if (args[1]) {
          const newNick = args.slice(1).join(" ");
          socket.send(JSON.stringify({ type: "nick", newNick }));
          setNick(newNick);
          localStorage.setItem("nick", newNick);
          addSystemMessage(`Your nickname is now ${newNick}`, true);
        } else addSystemMessage("Usage: /nick <new_name>", true);
        break;

      case "/theme":
        if (args[1] && themes[args[1]]) {
          setTheme(args[1]);
          localStorage.setItem("theme", args[1]);
          addSystemMessage(`Theme changed to ${args[1]}`, true);
        } else {
          addSystemMessage(
            "Available themes: " + Object.keys(themes).join(", "),
            true
          );
        }
        break;

      case "/help":
        addSystemMessage(
          `Available commands:
  /nick <name> — change your nickname
  /msg <user> <message> — send a private message
  /clear — clear your chat
  /theme <name> — change terminal theme
  /users — list online users
  /upload — share a file
  /help — show this help message`,
          true
        );
        break;

      case "/clear":
        setMessages([]);
        addSystemMessage("Chat cleared.", true);
        break;

      case "/msg":
        if (args[1] && args[2]) {
          const target = args[1];
          const msgText = args.slice(2).join(" ");
          socket.send(JSON.stringify({ type: "private", to: target, text: msgText }));
          addSystemMessage(`(Private to ${target}): ${msgText}`, true);
        } else addSystemMessage("Usage: /msg <user> <message>", true);
        break;

      case "/upload":
        fileInputRef.current?.click();
        break;

      case "/users":
        addSystemMessage(
          "Online users: " +
            users.map((u) => `${u.name}${u.isAdmin ? " [admin]" : ""}`).join(", "),
          true
        );
        break;

      default:
        addSystemMessage("Unknown command. Type /help for a list.", true);
    }
  };

  const addSystemMessage = (text, selfOnly = false) => {
    setMessages((prev) => [...prev, { from: "[system]", text }]);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      socket.send(
        JSON.stringify({
          type: "file",
          filename: file.name,
          data: reader.result,
        })
      );
      addSystemMessage(`File "${file.name}" sent!`, true);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      className="flex flex-col md:flex-row w-full h-[100vh] md:h-[90vh]"
      style={{
        backgroundColor: currentTheme.bg,
        color: currentTheme.text,
        transition: "0.3s ease",
      }}
    >
      {/* User list */}
      <div
        className="w-full md:w-1/4 p-3 overflow-y-auto border-b md:border-r border-[#222]"
        style={{ borderColor: currentTheme.accent }}
      >
        <h2 className="text-sm mb-2">Online Users</h2>
        <ul className="space-y-1 text-sm">
          {users.map((u) => (
            <li
              key={u.name}
              className="cursor-pointer hover:underline"
              onClick={() => setInput(`/msg ${u.name} `)}
            >
              {u.name}
              {u.isAdmin && " 👑"}
              {unreadPMs[u.name] ? (
                <span
                  style={{
                    color: currentTheme.accent,
                    marginLeft: 4,
                  }}
                >
                  ({unreadPMs[u.name]})
                </span>
              ) : null}
            </li>
          ))}
        </ul>

        <div className="mt-4">
          <label className="text-xs block mb-1">Theme:</label>
          <select
            value={theme}
            onChange={(e) => {
              setTheme(e.target.value);
              localStorage.setItem("theme", e.target.value);
            }}
            className="bg-transparent border border-[#333] text-xs p-1 rounded w-full"
          >
            {Object.keys(themes).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Chat display */}
      <div className="flex flex-col flex-1 p-3 overflow-y-auto">
        <div className="flex-1 overflow-y-auto mb-3">
          {messages.map((m, i) => (
            <div key={i} className="mb-1 break-words text-sm">
              {m.type === "file" ? (
                <div>
                  <strong>{m.from}:</strong>{" "}
                  <a
                    href={m.data}
                    download={m.filename}
                    style={{ color: currentTheme.accent }}
                  >
                    {m.filename}
                  </a>
                </div>
              ) : (
                <span>
                  <strong>{m.from}:</strong> {m.text}
                </span>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            className="flex-1 p-2 rounded bg-transparent border border-[#333] focus:outline-none text-sm"
            placeholder="Type a message or command..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
          />
          <button
            className="px-3 py-2 rounded text-sm"
            style={{
              backgroundColor: currentTheme.accent,
              color: currentTheme.bg,
            }}
            onClick={() => sendMessage(input)}
          >
            Send
          </button>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            onChange={handleFileUpload}
          />
        </div>
      </div>
    </div>
  );
}
