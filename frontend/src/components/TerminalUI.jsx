import React, { useState, useEffect, useRef } from "react";

export default function TerminalUI({ socket, nick, setNick, isAdmin }) {
  const terminalRef = useRef(null);
  const inputRef = useRef(null);
  const [lines, setLines] = useState([]);

  // Append message to terminal
  const appendLine = (html) => {
    setLines((prev) => [...prev, html]);
  };

  // Scroll down when new messages appear
  useEffect(() => {
    const el = terminalRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  // Listen for messages from WebSocket
  useEffect(() => {
    if (!socket) return;
    const onMsg = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "message") {
          appendLine(
            `<span class="nick">${msg.nick}</span>: ${escapeHtml(msg.text)}`
          );
        } else if (msg.type === "system") {
          appendLine(`<span class="meta">[system]</span> ${escapeHtml(msg.text)}`);
        } else if (msg.type === "history") {
          msg.history.forEach((m) =>
            appendLine(
              `<span class="nick">${m.nick}</span>: ${escapeHtml(m.text)}`
            )
          );
        } else if (msg.type === "clear") {
          setLines([]);
        }
      } catch {}
    };
    socket.addEventListener("message", onMsg);
    return () => socket.removeEventListener("message", onMsg);
  }, [socket]);

  const escapeHtml = (str) =>
    str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const handleCommand = (cmdline) => {
    const [cmd, ...rest] = cmdline.trim().substring(1).split(/\s+/);
    const args = rest.join(" ");

    switch (cmd) {
      case "help":
        appendLine(
          `<span class="meta">Available commands: /help, /nick &lt;name&gt;, /me &lt;action&gt;, /login &lt;key&gt;, /logout, /clear</span>`
        );
        break;

      case "nick":
        if (!args) return appendLine("<span class='meta'>Usage: /nick &lt;name&gt;</span>");
        setNick(args.substring(0, 24));
        localStorage.setItem("nick", args);
        socket.send(JSON.stringify({ type: "nick", newNick: args }));
        appendLine(`<span class="meta">Nickname changed to ${args}</span>`);
        break;

      case "login":
        if (!args) return appendLine("<span class='meta'>Usage: /login &lt;key&gt;</span>");
        socket.send(JSON.stringify({ type: "login", key: args }));
        break;

      case "logout":
        socket.send(JSON.stringify({ type: "logout" }));
        appendLine("<span class='meta'>Logged out of admin mode.</span>");
        break;

      case "me":
        if (!args) return appendLine("<span class='meta'>Usage: /me &lt;action&gt;</span>");
        socket.send(JSON.stringify({ type: "message", nick, text: `* ${nick} ${args}` }));
        break;

      case "clear":
        if (isAdmin) {
          socket.send(JSON.stringify({ type: "clear" }));
        } else {
          appendLine("<span class='meta'>(local) chat cleared.</span>");
          setLines([]);
        }
        break;

      default:
        appendLine(`<span class="meta">Unknown command: /${cmd}</span>`);
    }
  };

  const handleSend = (value) => {
    if (!value) return;
    if (value.startsWith("/")) return handleCommand(value);
    socket.send(JSON.stringify({ type: "message", nick, text: value }));
  };

  return (
    <div className="bg-black rounded-lg p-3">
      <div
        ref={terminalRef}
        className="h-[60vh] overflow-y-auto font-mono text-sm text-[#cfeedd]"
      >
        {lines.map((line, i) => (
          <div key={i} dangerouslySetInnerHTML={{ __html: line }} />
        ))}
      </div>
      <div className="flex gap-2 mt-3">
        <input
          ref={inputRef}
          type="text"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSend(e.target.value);
              e.target.value = "";
            }
          }}
          className="flex-1 bg-[#020807] border border-[#004d2b] rounded p-2 text-[#cfeedd]"
          placeholder="Type a message or command (/help)"
        />
      </div>
    </div>
  );
}
