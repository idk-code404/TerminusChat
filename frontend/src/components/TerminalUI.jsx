import React, { useState, useEffect, useRef } from "react";

export default function TerminalUI({ socket, nick, setNick }) {
  const [lines, setLines] = useState([]);
  const [input, setInput] = useState("");
  const termRef = useRef(null);

  useEffect(() => {
    if (!socket) return;
    socket.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "message") {
        appendLine(`<span class="nick">${msg.nick}:</span> ${escapeHtml(msg.text)}`);
      }

      else if (msg.type === "system") {
        appendLine(`<span class="meta">[system]</span> ${escapeHtml(msg.text)}`);
      }

      else if (msg.type === "history") {
        msg.data.forEach((m) => {
          if (m.type === "message")
            appendLine(`<span class="nick">${m.nick}:</span> ${escapeHtml(m.text)}`);
          else if (m.type === "system")
            appendLine(`<span class="meta">[system]</span> ${escapeHtml(m.text)}`);
        });
      }

      else if (msg.type === "clear") {
        setLines([]);
      }
    });
  }, [socket]);

  const appendLine = (html) => {
    setLines((prev) => [...prev, html].slice(-500));
    setTimeout(() => {
      if (termRef.current)
        termRef.current.scrollTop = termRef.current.scrollHeight;
    }, 50);
  };

  const sendCommand = (text) => {
    if (!text.trim()) return;
    if (text.startsWith("/")) {
      const [cmd, ...args] = text.slice(1).split(" ");
      handleCommand(cmd.toLowerCase(), args.join(" "));
    } else if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "message", text, nick }));
    }
    setInput("");
  };

  const handleCommand = (cmd, args) => {
    switch (cmd) {
      case "nick":
        if (!args) {
          appendLine("<span class='meta'>Usage: /nick &lt;newName&gt;</span>");
        } else {
          const newNick = args.substring(0, 24);
          socket.send(JSON.stringify({ type: "nick", oldNick: nick, newNick }));
          setNick(newNick);
          localStorage.setItem("nick", newNick);
        }
        break;

      case "clear":
        setLines([]);
        socket.send(JSON.stringify({ type: "clear" }));
        break;

      default:
        appendLine(`<span class='meta'>Unknown command: /${cmd}</span>`);
    }
  };

  return (
    <div>
      <div
        ref={termRef}
        className="bg-black p-3 rounded h-[70vh] overflow-y-auto text-green-400 font-mono text-sm"
      >
        {lines.map((l, i) => (
          <div key={i} dangerouslySetInnerHTML={{ __html: l }} />
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendCommand(input);
        }}
        className="flex gap-2 mt-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 bg-[#0a0a0a] text-green-400 border border-green-700 rounded p-2"
          placeholder="Type message or /help"
        />
      </form>
    </div>
  );
}

function escapeHtml(unsafe) {
  return unsafe.replace(/[&<"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", '"': "&quot;", "'": "&#039;" }[m]));
}
