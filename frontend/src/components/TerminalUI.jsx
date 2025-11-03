import React, { useEffect, useRef, useState } from "react";

/**
 * TerminalUI (theme fix + PMs + user list + unread counters + click-to-PM)
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

  // Load PM sound (optional)
  useEffect(() => {
    try {
      pmSound.current = new Audio("/notification.mp3");
      pmSound.current.preload = "auto";
    } catch {
      pmSound.current = null;
    }
  }, []);

  // --- Theme handling ----------------------------------------------------
  function applyTheme(theme) {
    // theme: 'green' | 'white' | 'solar'
    const root = document.documentElement;
    if (theme === "white") {
      root.style.setProperty("--accent", "#ffffff");
      root.style.setProperty("--muted", "#d0d0d0");
      root.style.setProperty("--bg", "#0b0f10");
      root.style.setProperty("--terminal-bg", "#f7f7f8");
      root.style.setProperty("--terminal-text", "#0b0f10");
      root.style.setProperty("--input-bg", "#ffffff");
      root.style.setProperty("--send-bg", "#e6e6e6");
      root.style.setProperty("--nick-color", "#000000");
      document.body.style.background = "#f2f4f5";
    } else if (theme === "solar") {
      root.style.setProperty("--accent", "#ffb86b");
      root.style.setProperty("--muted", "#e6cdb1");
      root.style.setProperty("--bg", "#071013");
      root.style.setProperty("--terminal-bg", "#0c0a07");
      root.style.setProperty("--terminal-text", "#f5e9d0");
      root.style.setProperty("--input-bg", "#0b0a09");
      root.style.setProperty("--send-bg", "#2b1a12");
      root.style.setProperty("--nick-color", "#ffb86b");
      document.body.style.background = "#071013";
    } else {
      // default green
      root.style.setProperty("--accent", "#00ff6a");
      root.style.setProperty("--muted", "#9db0a5");
      root.style.setProperty("--bg", "#071013");
      root.style.setProperty("--terminal-bg", "#020807");
      root.style.setProperty("--terminal-text", "#cfeedd");
      root.style.setProperty("--input-bg", "#00140a");
      root.style.setProperty("--send-bg", "#00140a");
      root.style.setProperty("--nick-color", "#00ff6a");
      document.body.style.background = "#071013";
    }
    localStorage.setItem("theme", theme);
  }

  // apply stored theme on mount
  useEffect(() => {
    const t = localStorage.getItem("theme") || "green";
    applyTheme(t);
  }, []);

  // helper escape
  const escapeHtml = (s = "") =>
    String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  // Append line
  const appendLine = (html) =>
    setLines((prev) => {
      const out = [...prev, html];
      return out.slice(-1000);
    });

  // scroll on new lines
  useEffect(() => {
    const el = terminalRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  // WebSocket message handling
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
          appendLine(`<span class="meta" style="color:var(--accent);">(private)</span> <span class="nick">${escapeHtml(payload.from)}</span> → <span class="nick">${escapeHtml(payload.to)}</span>: ${escapeHtml(payload.text)}`);
          if (payload.to === nick && payload.from !== nick) {
            setUnreadPMs((prev) => ({ ...prev, [payload.from]: (prev[payload.from] || 0) + 1 }));
            document.title = `📩 New PM from ${payload.from}`;
            try { pmSound.current && pmSound.current.play(); } catch {}
          }
          break;

        case "system":
          // server now sends command-system messages privately to the invoker
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

  // clear generic title on focus
  useEffect(() => {
    const onFocus = () => { document.title = "TerminusChat"; };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // send nick on open
  useEffect(() => {
    if (!socket) return;
    const onOpen = () => {
      try { socket.send(JSON.stringify({ type: "nick", newNick: nick })); } catch {}
    };
    socket.addEventListener("open", onOpen);
    return () => socket.removeEventListener("open", onOpen);
  }, [socket, nick]);

  // handle slash commands
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
          setNick(newNick); // parent persists to cookie/localStorage
          try { socket && socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: "nick", newNick })); } catch {}
          appendLine(`<span class="meta">Nickname updated to <span style="color:var(--nick-color)">${escapeHtml(newNick)}</span></span>`);
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
        try { socket && socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: "private", to, text })); appendLine(`<span class="meta">(to ${escapeHtml(to)})</span> ${escapeHtml(text)}`); } catch { appendLine(`<span class="meta">Failed to send private message.</span>`); }
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
          setLines([]); appendLine(`<span class="meta">(local) chat cleared.</span>`);
        }
        break;

      default:
        appendLine(`<span class="meta">Unknown command: /${escapeHtml(cmd)}</span>`);
    }
  };

  const handleSend = (value) => {
    if (!value) return;
    if (value.startsWith("/")) { handleCommand(value); return; }
    try { socket && socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: "message", text: value })); } catch { appendLine(`<span class="meta">Failed to send message (socket closed).</span>`); }
  };

  // clicking a user prefills /msg and clears their unread counter
  const handleClickUser = (username) => {
    if (!inputRef.current) return;
    inputRef.current.value = `/msg ${username} `;
    inputRef.current.focus();
    setUnreadPMs((prev) => {
      const copy = { ...prev };
      delete copy[username];
      return copy;
    });
    // reset title if no unread remain
    const remaining = Object.values(unreadPMs).reduce((a, b) => a + b, 0);
    if (!remaining) document.title = "TerminusChat";
  };

  // theme select handler used by <select>
  const onThemeChange = (e) => applyTheme(e.target.value);

  // Styles that reference CSS variables (so themes affect these)
  const terminalStyle = {
    background: "var(--terminal-bg)",
    color: "var(--terminal-text)",
  };
  const sidebarStyle = {
    background: "var(--bg)",
    color: "var(--muted)",
  };
  const inputStyle = {
    background: "var(--input-bg)",
    color: "var(--terminal-text)",
    border: "1px solid rgba(255,255,255,0.03)",
  };
  const sendBtnStyle = {
    background: "var(--send-bg)",
    color: "var(--accent)",
  };

  return (
    <div className="flex gap-4">
      {/* Terminal area */}
      <div className="flex-1">
        <div ref={terminalRef} className="rounded p-3 min-h-[400px] max-h-[60vh] overflow-auto font-mono text-sm" style={terminalStyle}>
          {lines.map((l, i) => (
            <div key={i} className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: l }} />
          ))}
        </div>

        <div className="flex gap-2 mt-3">
          <input
            ref={inputRef}
            className="flex-1 p-2 rounded text-sm"
            style={inputStyle}
            placeholder="Type a message or /command (eg. /help or /msg user hello)"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const val = e.target.value;
                e.target.value = "";
                handleSend(val);
              }
            }}
          />
          <button className="px-4 py-2 rounded" style={sendBtnStyle} onClick={() => { const val = inputRef.current?.value || ""; if (val) { inputRef.current.value = ""; handleSend(val); } }}>
            Send
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <aside className="w-56 p-2 rounded overflow-y-auto h-[60vh] font-mono" style={sidebarStyle}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6, color: "var(--muted)" }}>Appearance</div>
          <select defaultValue={localStorage.getItem("theme") || "green"} onChange={onThemeChange} className="w-full p-1 rounded" style={{ background: "transparent", color: "var(--muted)", border: "1px solid rgba(255,255,255,0.03)" }}>
            <option value="green">Green (default)</option>
            <option value="white">White</option>
            <option value="solar">Solar</option>
          </select>
        </div>

        <div style={{ fontWeight: 700, marginBottom: 8, color: "var(--muted)" }}>Users Online</div>
        {users.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)" }}>No users online</div>}
        {users.map((u) => (
          <div key={u.nick} onClick={() => handleClickUser(u.nick)} title={`Click to send a private message to ${u.nick}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, cursor: "pointer" }} >
            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--terminal-text)" }}>{u.nick}</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {u.isAdmin && <span style={{ color: "#ffb86b", fontSize: 12 }}>[ADMIN]</span>}
              {unreadPMs[u.nick] ? <span style={{ background: "red", color: "white", padding: "2px 6px", borderRadius: 8, fontSize: 12 }}>{unreadPMs[u.nick]}</span> : null}
            </div>
          </div>
        ))}
      </aside>
    </div>
  );
}
