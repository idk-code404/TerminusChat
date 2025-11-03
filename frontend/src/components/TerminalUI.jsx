import React, { useEffect, useRef, useState } from "react";

/**
 * TerminalUI — Responsive + cleaner themes + PMs + user list + unread counters + click-to-PM
 *
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const pmSound = useRef(null);
  const STYLE_ID = "terminuschat-theme-styles-v2";

  // inject CSS once (component-level styles + theme variables classes)
  useEffect(() => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.innerHTML = `
/* Base layout */
.tc-wrapper{ display:flex; gap:16px; align-items:stretch; height: calc(100vh - 120px); min-height:400px; }
.tc-main{ flex:1; display:flex; flex-direction:column; min-width:0; }
.tc-terminal{ flex:1; overflow:auto; border-radius:8px; padding:14px; box-sizing:border-box; transition: background 250ms, color 250ms; }
.tc-input-row{ display:flex; gap:8px; margin-top:12px; }
.tc-input{ flex:1; border-radius:8px; padding:10px 12px; font-family:inherit; font-size:14px; outline:none; box-sizing:border-box; transition: background 200ms, color 200ms, border 200ms; }
.tc-send{ border-radius:8px; padding:10px 14px; cursor:pointer; border:none; font-weight:600; }
.tc-sidebar{ width:260px; min-width:200px; border-radius:8px; padding:12px; box-sizing:border-box; transition: background 250ms, color 250ms; display:flex; flex-direction:column; gap:12px; }
.tc-user-row{ display:flex; justify-content:space-between; align-items:center; padding:6px 8px; border-radius:6px; cursor:pointer; transition: background 120ms; }
.tc-user-row:hover{ filter:brightness(1.05); }
.tc-unread-badge{ background: #e11; color:#fff; padding:2px 7px; border-radius:999px; font-size:12px; }
.tc-meta{ font-size:13px; color:var(--muted) }

/* responsive */
@media (max-width:960px){
  .tc-wrapper{ gap:12px; height: calc(100vh - 140px); }
  .tc-sidebar{ position: absolute; right: 12px; top: 88px; z-index:40; box-shadow:0 10px 30px rgba(0,0,0,0.6); }
  .tc-sidebar.closed{ display:none; }
}

/* theme classes (clean, central) */
:root { --accent: #00ff6a; --muted: #9db0a5; --bg: #071013; --terminal-bg:#020807; --terminal-text:#cfeedd; --input-bg:#00140a; --send-bg:#00140a; --nick-color:var(--accent); --sidebar-bg: rgba(0,0,0,0.16); }

/* WHITE THEME */
.theme-white { --accent: #0b0f10; --muted: #475057; --bg: #ffffff; --terminal-bg:#f6f6f7; --terminal-text:#0b0f10; --input-bg:#ffffff; --send-bg:#e6e6e6; --nick-color:#0b0f10; --sidebar-bg: rgba(0,0,0,0.03); }

/* SOLAR THEME */
.theme-solar { --accent: #ffb86b; --muted: #e6cdb1; --bg: #071013; --terminal-bg:#0c0a07; --terminal-text:#f5e9d0; --input-bg:#0b0a09; --send-bg:#2b1a12; --nick-color:#ffb86b; --sidebar-bg: rgba(0,0,0,0.12); }

/* use variables */
.tc-terminal{ background: var(--terminal-bg); color: var(--terminal-text); border: 1px solid rgba(255,255,255,0.03); }
.tc-sidebar{ background: var(--sidebar-bg); color: var(--muted); border: 1px solid rgba(255,255,255,0.03); }
.tc-input{ background: var(--input-bg); color: var(--terminal-text); border:1px solid rgba(255,255,255,0.03); }
.tc-send{ background: var(--send-bg); color: var(--accent); border: 1px solid rgba(255,255,255,0.04); }
.nick{ color: var(--nick-color); font-weight:700; }
.meta{ color: var(--muted); font-size:13px; }
`;
    document.head.appendChild(style);
  }, []);

  // load PM sound (optional)
  useEffect(() => {
    try {
      pmSound.current = new Audio("/notification.mp3");
      pmSound.current.preload = "auto";
    } catch {
      pmSound.current = null;
    }
  }, []);

  // Apply theme class based on localStorage (green default)
  useEffect(() => {
    const t = localStorage.getItem("theme") || "green";
    applyThemeClass(t);
  }, []);

  function applyThemeClass(theme) {
    const root = document.documentElement;
    root.classList.remove("theme-white", "theme-solar");
    if (theme === "white") root.classList.add("theme-white");
    else if (theme === "solar") root.classList.add("theme-solar");
    // green = default (no extra class)
    localStorage.setItem("theme", theme);
  }

  // helper escape
  const escapeHtml = (s = "") =>
    String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  // append messages
  const appendLine = (html) =>
    setLines((prev) => {
      const out = [...prev, html];
      return out.slice(-1200);
    });

  // scroll terminal on updates
  useEffect(() => {
    const el = terminalRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  // socket message handling (preserve behavior)
  useEffect(() => {
    if (!socket) return;
    const onMessage = (ev) => {
      let payload;
      try {
        payload = JSON.parse(ev.data);
      } catch {
        appendLine(`<div class="meta">[raw] ${escapeHtml(ev.data)}</div>`);
        return;
      }

      switch (payload.type) {
        case "message":
          appendLine(`<span class="nick">${escapeHtml(payload.nick)}</span>: ${escapeHtml(payload.text)}`);
          break;

        case "private":
          appendLine(`<span class="meta" style="color:var(--accent)">(private)</span> <span class="nick">${escapeHtml(payload.from)}</span> → <span class="nick">${escapeHtml(payload.to)}</span>: ${escapeHtml(payload.text)}`);
          // unread counter only when recipient is me
          if (payload.to === nick && payload.from !== nick) {
            setUnreadPMs((prev) => ({ ...prev, [payload.from]: (prev[payload.from] || 0) + 1 }));
            document.title = `📩 New PM from ${payload.from}`;
            try { pmSound.current && pmSound.current.play(); } catch {}
          }
          break;

        case "system":
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

  // focus clears generic title (not per-user counters)
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
          appendLine(`<span class="meta">Nickname changed to <span class="nick">${escapeHtml(newNick)}</span></span>`);
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

  // click user -> prefill /msg and clear that user's unread count
  const handleClickUser = (username) => {
    if (!inputRef.current) return;
    inputRef.current.value = `/msg ${username} `;
    inputRef.current.focus();
    setUnreadPMs((prev) => {
      const copy = { ...prev };
      delete copy[username];
      return copy;
    });
  };

  // theme change handler
  const onThemeSelect = (e) => {
    applyThemeClass(e.target.value);
  };

  return (
    <div className="tc-wrapper" style={{ padding: 8 }}>
      <div className="tc-main">
        <div ref={terminalRef} className="tc-terminal" role="log" aria-live="polite">
          {lines.map((l, i) => (
            <div key={i} className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: l }} />
          ))}
        </div>

        <div className="tc-input-row">
          <input
            ref={inputRef}
            className="tc-input"
            placeholder="Type a message or /command (eg. /help or /msg user hello)"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const v = e.target.value;
                e.target.value = "";
                handleSend(v);
              }
            }}
          />
          <button className="tc-send" onClick={() => { const v = inputRef.current?.value || ""; if (v) { inputRef.current.value = ""; handleSend(v); } }}>
            Send
          </button>
        </div>
      </div>

      {/* sidebar */}
      <aside className={`tc-sidebar ${!sidebarOpen ? "closed" : ""}`}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 700, color: "var(--muted)" }}>Appearance</div>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer" }}>
            {sidebarOpen ? "Hide" : "Show"}
          </button>
        </div>

        <select defaultValue={localStorage.getItem("theme") || "green"} onChange={onThemeSelect} style={{ width: "100%", padding: 8, borderRadius: 6, background: "transparent", color: "var(--muted)", border: "1px solid rgba(255,255,255,0.03)" }}>
          <option value="green">Green (default)</option>
          <option value="white">White</option>
          <option value="solar">Solar</option>
        </select>

        <div style={{ fontWeight: 700, marginTop: 12, color: "var(--muted)" }}>Users Online</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
          {users.length === 0 && <div className="tc-meta">No users online</div>}
          {users.map((u) => (
            <div key={u.nick} className="tc-user-row" onClick={() => handleClickUser(u.nick)} title={`Click to PM ${u.nick}`}>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--terminal-text)" }}>{u.nick}</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {u.isAdmin && <div style={{ color: "#ffb86b", fontSize: 12 }}>[ADMIN]</div>}
                {unreadPMs[u.nick] ? <div className="tc-unread-badge">{unreadPMs[u.nick]}</div> : null}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: "auto", paddingTop: 8 }}>
          <div className="tc-meta">You: <span style={{ color: "var(--nick-color)" }}>{nick}</span></div>
          {isAdmin && <div style={{ color: "var(--accent)", marginTop: 6, fontWeight: 600 }}>ADMIN MODE</div>}
        </div>
      </aside>
    </div>
  );
}
