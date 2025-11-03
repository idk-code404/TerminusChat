import React, { useEffect, useRef, useState } from "react";

/**
 * TerminalUI (updated)
 * Props:
 *  - socket: WebSocket instance
 *  - nick: current nickname
 *  - setNick: function(newNick) -> persists name in parent
 */
export default function TerminalUI({ socket, nick, setNick }) {
  const terminalRef = useRef(null);
  const inputRef = useRef(null);
  const [lines, setLines] = useState([]);
  const [users, setUsers] = useState([]);
  const [unreadPMs, setUnreadPMs] = useState({});
  const [isAdmin, setIsAdmin] = useState(false);
  const pmSound = useRef(null);

  // Theme handling: green (default), white, solar
  const applyTheme = (theme) => {
    // define theme variables
    if (theme === "white") {
      document.documentElement.style.setProperty("--accent", "#ffffff");
      document.documentElement.style.setProperty("--muted", "#d0d0d0");
      document.documentElement.style.setProperty("--bg", "#0b0f10");
    } else if (theme === "solar") {
      document.documentElement.style.setProperty("--accent", "#ffb86b");
      document.documentElement.style.setProperty("--muted", "#e6cdb1");
      document.documentElement.style.setProperty("--bg", "#071013");
    } else {
      // default green
      document.documentElement.style.setProperty("--accent", "#00ff6a");
      document.documentElement.style.setProperty("--muted", "#9db0a5");
      document.documentElement.style.setProperty("--bg", "#071013");
    }
    localStorage.setItem("theme", theme);
  };

  // load theme on mount
  useEffect(() => {
    const t = localStorage.getItem("theme") || "green";
    applyTheme(t);
  }, []);

  // load pm sound
  useEffect(() => {
    try {
      pmSound.current = new Audio("/notification.mp3");
      pmSound.current.preload = "auto";
    } catch (e) {
      pmSound.current = null;
    }
  }, []);

  const escapeHtml = (s = "") =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const appendLine = (html) => {
    setLines((p) => {
      const arr = [...p, html];
      return arr.slice(-1000);
    });
  };

  // apply messages from socket
  useEffect(() => {
    if (!socket) return;
    const onMessage = (ev) => {
      let payload;
      try { payload = JSON.parse(ev.data); } catch { appendLine(`<div class="meta">[raw] ${escapeHtml(ev.data)}</div>`); return; }

      switch (payload.type) {
        case "message":
          appendLine(`<span class="nick">${escapeHtml(payload.nick)}</span>: ${escapeHtml(payload.text)}`);
          break;

        case "private":
          appendLine(`<span class="meta" style="color:#ff0;">(private)</span> <span class="nick">${escapeHtml(payload.from)}</span> → <span class="nick">${escapeHtml(payload.to)}</span>: ${escapeHtml(payload.text)}`);
          if (payload.to === nick && payload.from !== nick) {
            setUnreadPMs((prev) => ({ ...prev, [payload.from]: (prev[payload.from] || 0) + 1 }));
            document.title = `📩 New PM from ${payload.from}`;
            try { pmSound.current && pmSound.current.play(); } catch {}
          }
          break;

        case "system":
          // system messages by commands are typically private (server sends only to invoker).
          appendLine(`<span class="meta">[system]</span> ${escapeHtml(payload.text)}`);
          break;

        case "history":
          if (Array.isArray(payload.history)) {
            payload.history.forEach((m) => {
              if (m.type === "message") appendLine(`<span class="nick">${escapeHtml(m.nick)}</span>: ${escapeHtml(m.text)}`);
              else if (m.type === "system") appendLine(`<span class="meta">[system]</span> ${escapeHtml(m.text)}`);
            });
          }
          break;

        case "clear":
          setLines([]);
          break;

        case "user-list":
          setUsers(Array.isArray(payload.users) ? payload.users : []);
          break;

        case "admin-status":
          setIsAdmin(Boolean(payload.value));
          break;

        default:
          appendLine(`<span class="meta">[unknown]</span> ${escapeHtml(JSON.stringify(payload))}`);
      }
    };

    socket.addEventListener("message", onMessage);
    return () => socket.removeEventListener("message", onMessage);
  }, [socket, nick]);

  // scroll
  useEffect(() => {
    const el = terminalRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  // focus clears unread counters? We'll clear per-user when clicked; global clear on focus:
  useEffect(() => {
    const onFocus = () => { document.title = "TerminusChat"; };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // commands
  const handleCommand = (raw) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const [cmd, ...parts] = trimmed.substring(1).split(/\s+/);
    const args = parts.join(" ");

    switch ((cmd || "").toLowerCase()) {
      case "help":
        appendLine(`<span class="meta">Commands: /help, /nick &lt;name&gt;, /me &lt;action&gt;, /msg &lt;user&gt; &lt;text&gt;, /login &lt;key&gt;, /logout, /clear</span>`);
        break;

      case "nick":
        if (!args) { appendLine(`<span class="meta">Usage: /nick &lt;name&gt;</span>`); return; }
        {
          const newNick = args.substring(0, 24);
          setNick(newNick);
          try { socket && socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: "nick", newNick })); } catch {}
          appendLine(`<span class="meta">Nickname change requested (server confirmation may follow).</span>`);
        }
        break;

      case "me":
        if (!args) { appendLine(`<span class="meta">Usage: /me &lt;action&gt;</span>`); return; }
        try { socket && socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: "message", text: `* ${nick} ${args}` })); } catch {}
        break;

      case "msg": {
        const [to, ...rest] = parts;
        const text = rest.join(" ");
        if (!to || !text) { appendLine(`<span class="meta">Usage: /msg &lt;user&gt; &lt;text&gt;</span>`); return; }
        try { socket && socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: "private", to, text })); appendLine(`<span class="meta">(to ${escapeHtml(to)})</span> ${escapeHtml(text)}`); } catch {}
        break;
      }

      case "login":
        if (!args) { appendLine(`<span class="meta">Usage: /login &lt;key&gt;</span>`); return; }
        try { socket && socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: "login", key: args })); } catch {}
        break;

      case "logout":
        try { socket && socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: "logout" })); setIsAdmin(false); appendLine(`<span class="meta">Logged out of admin mode.</span>`); } catch {}
        break;

      case "clear":
        if (isAdmin) {
          try { socket && socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: "clear" })); } catch {}
        } else {
          setLines([]);
          appendLine(`<span class="meta">(local) chat cleared.</span>`);
        }
        break;

      default:
        appendLine(`<span class="meta">Unknown command: /${escapeHtml(cmd)}</span>`);
    }
  };

  const handleSend = (value) => {
    if (!value) return;
    if (value.startsWith("/")) return handleCommand(value);
    try { socket && socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: "message", text: value })); } catch { appendLine(`<span class="meta">Failed to send message.</span>`); }
  };

  // click username -> prefill /msg and clear unread for that user
  const handleClickUser = (username) => {
    if (!inputRef.current) return;
    inputRef.current.value = `/msg ${username} `;
    inputRef.current.focus();
    // clear unread for that user
    setUnreadPMs((prev) => {
      const copy = { ...prev }; delete copy[username]; return copy;
    });
    // reset title if no unread left
    const totalUnread = Object.values(unreadPMs).reduce((a, b) => a + b, 0);
    if (!totalUnread) document.title = "TerminusChat";
  };

  // theme change UI
  const onThemeChange = (e) => applyTheme(e.target.value);

  return (
    <div className="flex gap-4">
      {/* Terminal */}
      <div className="flex-1">
        <div ref={terminalRef} className="bg-[#020807] rounded p-3 min-h-[400px] max-h-[60vh] overflow-auto font-mono text-sm text-[#cfeedd]">
          {lines.map((l, i) => <div key={i} className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: l }} />)}
        </div>

        <div className="flex gap-2 mt-3">
          <input ref={inputRef} className="flex-1 bg-[#00140a] p-2 rounded text-sm text-[#cfeedd]" placeholder="Type message or /command" onKeyDown={(e) => { if (e.key === 'Enter') { const v = e.target.value; e.target.value = ''; handleSend(v); } }} />
          <button className="bg-[#00140a] px-4 py-2 rounded text-[#00ff6a]" onClick={() => { const v = inputRef.current?.value || ''; if (v) { inputRef.current.value = ''; handleSend(v); } }}>Send</button>
        </div>
      </div>

      {/* Sidebar */}
      <aside className="w-56 bg-[#071013] text-[#9db0a5] p-2 rounded overflow-y-auto h-[60vh] font-mono">
        <div className="mb-3">
          <div className="font-bold">Appearance</div>
          <select defaultValue={localStorage.getItem('theme') || 'green'} onChange={onThemeChange} className="w-full mt-2 bg-[#061010] p-1 rounded">
            <option value="green">Green (default)</option>
            <option value="white">White</option>
            <option value="solar">Solar</option>
          </select>
        </div>

        <div className="font-bold mb-2">Users Online</div>
        {users.length === 0 && <div className="text-sm text-[#6b786f]">No users online</div>}
        {users.map((u) => (
          <div key={u.nick} className="flex items-center justify-between gap-2 cursor-pointer hover:bg-[#00140a] p-1 rounded" onClick={() => handleClickUser(u.nick)}>
            <div className="truncate">{u.nick}</div>
            <div className="flex items-center gap-2">
              {u.isAdmin && <span className="text-yellow-400 text-xs">[ADMIN]</span>}
              {unreadPMs[u.nick] ? <span className="bg-red-600 text-white px-2 py-0.5 rounded text-xs">{unreadPMs[u.nick]}</span> : null}
            </div>
          </div>
        ))}
      </aside>
    </div>
  );
}
