import React, { useEffect, useRef, useState } from "react";

/**
 * TerminalUI — Sidebar auto-only (no show/hide button), responsive + themes + PMs + unread counters + click-to-PM.
 *
 * Props:
 *  - socket: WebSocket instance
 *  - nick: current nickname
 *  - setNick: function(newNick)
 */
export default function TerminalUI({ socket, nick, setNick }) {
  const wrapperRef = useRef(null);
  const terminalRef = useRef(null);
  const inputRef = useRef(null);

  const [lines, setLines] = useState([]);
  const [users, setUsers] = useState([]);
  const [unreadPMs, setUnreadPMs] = useState({});
  const [isAdmin, setIsAdmin] = useState(false);

  // sidebar open default: open on desktop, closed on mobile
  const isClient = typeof window !== "undefined";
  const [sidebarOpen, setSidebarOpen] = useState(() => (isClient ? window.innerWidth > 960 : true));
  const [mobileInputFixed, setMobileInputFixed] = useState(() => (isClient ? window.innerWidth <= 640 : false));
  const pmSoundRef = useRef(null);

  // inject styles once
  useEffect(() => {
    const ID = "terminusui-no-toggle-styles";
    if (document.getElementById(ID)) return;
    const style = document.createElement("style");
    style.id = ID;
    style.innerHTML = `
/* Layout */
.tc-wrapper { display:flex; gap:16px; align-items:stretch; width:100%; box-sizing:border-box; padding:8px; }
.tc-main { flex:1; display:flex; flex-direction:column; min-width:0; }
.tc-terminal { flex:1; overflow:auto; border-radius:8px; padding:14px; box-sizing:border-box; transition: background 200ms, color 200ms; }
.tc-input-row { display:flex; gap:8px; margin-top:12px; align-items:center; }
.tc-input { flex:1; border-radius:8px; padding:10px 12px; font-family:inherit; font-size:14px; outline:none; box-sizing:border-box; border:1px solid rgba(255,255,255,0.03); }
.tc-send { border-radius:8px; padding:10px 14px; cursor:pointer; border:none; font-weight:600; }

/* Sidebar and animation */
.tc-sidebar { width:260px; min-width:200px; border-radius:8px; padding:12px; box-sizing:border-box; display:flex; flex-direction:column; gap:12px; transition: transform 220ms ease, opacity 220ms ease; transform: translateX(0); opacity:1; will-change:transform,opacity; position:relative; }
.tc-sidebar.closed { transform: translateX(14px) scale(0.98); opacity:0; pointer-events:none; }

/* user row */
.tc-user-row { display:flex; justify-content:space-between; align-items:center; padding:6px 8px; border-radius:6px; cursor:pointer; transition: background 120ms; }
.tc-user-row:hover { background: rgba(255,255,255,0.02); }
.tc-unread-badge { background: #e11; color:#fff; padding:2px 7px; border-radius:999px; font-size:12px; }

/* Input fixed on mobile */
@media (max-width:640px){
  .tc-wrapper { gap:10px; }
  .tc-sidebar { position: absolute; right: 12px; top: 88px; z-index:80; box-shadow: 0 12px 30px rgba(0,0,0,0.5); }
  .tc-sidebar.closed { display:block; } /* keep for animation; pointer-events:none prevents clicks */
  .tc-input-row.mobile-fixed { position: fixed; left: 12px; right: 12px; bottom: 12px; z-index:90; background: transparent; padding: 8px 0; }
  .tc-main { padding-bottom: 84px; }
}

/* theme vars (defaults) */
:root { --accent: #00ff6a; --muted: #9db0a5; --bg: #071013; --terminal-bg: #020807; --terminal-text: #cfeedd; --input-bg: #00140a; --send-bg: #00140a; --nick-color: var(--accent); --sidebar-bg: rgba(0,0,0,0.16); }
.theme-white { --accent:#0b0f10; --muted:#475057; --bg:#ffffff; --terminal-bg:#f6f6f7; --terminal-text:#0b0f10; --input-bg:#ffffff; --send-bg:#e6e6e6; --nick-color:#0b0f10; --sidebar-bg: rgba(0,0,0,0.03); }
.theme-solar { --accent:#ffb86b; --muted:#e6cdb1; --bg:#071013; --terminal-bg:#0c0a07; --terminal-text:#f5e9d0; --input-bg:#0b0a09; --send-bg:#2b1a12; --nick-color:#ffb86b; --sidebar-bg: rgba(0,0,0,0.12); }

/* apply variables */
.tc-terminal { background: var(--terminal-bg); color: var(--terminal-text); border: 1px solid rgba(255,255,255,0.03); border-radius:8px; }
.tc-sidebar { background: var(--sidebar-bg); color: var(--muted); border: 1px solid rgba(255,255,255,0.03); border-radius:8px; }
.tc-input { background: var(--input-bg); color: var(--terminal-text); }
.tc-send { background: var(--send-bg); color: var(--accent); border: 1px solid rgba(255,255,255,0.04); }
.nick { color: var(--nick-color); font-weight:700; }
.meta { color: var(--muted); font-size:13px; }
`;
    document.head.appendChild(style);
  }, []);

  // auto-fit wrapper height by measuring header
  useEffect(() => {
    function updateHeight() {
      const header = document.querySelector("header");
      const headerH = header ? header.getBoundingClientRect().height : 120;
      const padding = 28;
      const newH = Math.max(220, window.innerHeight - headerH - padding);
      if (wrapperRef.current) wrapperRef.current.style.height = `${newH}px`;

      setMobileInputFixed(window.innerWidth <= 640);
      // auto-open/close sidebar depending on width (no manual toggle)
      if (window.innerWidth > 960) setSidebarOpen(true);
      else setSidebarOpen(false);
    }
    updateHeight();
    window.addEventListener("resize", updateHeight);
    window.addEventListener("orientationchange", updateHeight);
    return () => {
      window.removeEventListener("resize", updateHeight);
      window.removeEventListener("orientationchange", updateHeight);
    };
  }, []);

  // load pm sound
  useEffect(() => {
    try {
      pmSoundRef.current = new Audio("/notification.mp3");
      pmSoundRef.current.preload = "auto";
    } catch {
      pmSoundRef.current = null;
    }
  }, []);

  // websocket message handling
  useEffect(() => {
    if (!socket) return;
    const onMsg = (ev) => {
      let payload;
      try { payload = JSON.parse(ev.data); } catch { appendLine(`<div class="meta">[raw] ${escapeHtml(ev.data)}</div>`); return; }

      switch (payload.type) {
        case "message":
          appendLine(`<span class="nick">${escapeHtml(payload.nick)}</span>: ${escapeHtml(payload.text)}`);
          break;
        case "private":
          appendLine(`<span class="meta" style="color:var(--accent)">(private)</span> <span class="nick">${escapeHtml(payload.from)}</span> → <span class="nick">${escapeHtml(payload.to)}</span>: ${escapeHtml(payload.text)}`);
          if (payload.to === nick && payload.from !== nick) {
            setUnreadPMs((prev) => ({ ...prev, [payload.from]: (prev[payload.from] || 0) + 1 }));
            document.title = `📩 New PM from ${payload.from}`;
            try { pmSoundRef.current && pmSoundRef.current.play(); } catch {}
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

    socket.addEventListener("message", onMsg);
    return () => socket.removeEventListener("message", onMsg);
  }, [socket, nick]);

  // send nick when socket opens
  useEffect(() => {
    if (!socket) return;
    const onOpen = () => {
      try { socket.send(JSON.stringify({ type: "nick", newNick: nick })); } catch {}
    };
    socket.addEventListener("open", onOpen);
    return () => socket.removeEventListener("open", onOpen);
  }, [socket, nick]);

  // helpers
  const escapeHtml = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const appendLine = (html) => setLines((p) => [...p, html].slice(-1200));

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

  // click user -> prefill /msg and clear unread
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

  // theme apply helper
  const applyThemeClass = (theme) => {
    const root = document.documentElement;
    root.classList.remove("theme-white", "theme-solar");
    if (theme === "white") root.classList.add("theme-white");
    else if (theme === "solar") root.classList.add("theme-solar");
    localStorage.setItem("theme", theme);
  };

  // classes and mobile input
  const sidebarClass = sidebarOpen ? "tc-sidebar" : "tc-sidebar closed";
  const inputRowClass = mobileInputFixed ? "tc-input-row mobile-fixed" : "tc-input-row";

  return (
    <div ref={wrapperRef} className="tc-wrapper">
      {/* Main chat */}
      <div className="tc-main" style={{ minHeight: 0 }}>
        <div ref={terminalRef} className="tc-terminal" role="log" aria-live="polite">
          {lines.map((l, i) => (
            <div key={i} className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: l }} />
          ))}
        </div>

        <div className={inputRowClass} style={{ alignItems: "center" }}>
          <input
            ref={inputRef}
            className="tc-input"
            placeholder="Type message or /command (eg. /help or /msg user hello)"
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

      {/* Sidebar (auto open/closed based on viewport) */}
      <aside className={sidebarClass} style={{ position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700, color: "var(--muted)" }}>Appearance</div>
          <div>
            <select defaultValue={localStorage.getItem("theme") || "green"} onChange={(e) => applyThemeClass(e.target.value)} style={{ padding: 6, borderRadius: 6, background: "transparent", color: "var(--muted)" }}>
              <option value="green">Green</option>
              <option value="white">White</option>
              <option value="solar">Solar</option>
            </select>
          </div>
        </div>

        <div style={{ fontWeight: 700, marginTop: 8, color: "var(--muted)" }}>Users Online</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
          {users.length === 0 && <div className="meta tc-meta">No users online</div>}
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
          <div className="tc-meta">You: <span className="nick" style={{ color: "var(--nick-color)" }}>{nick}</span></div>
          {isAdmin && <div style={{ color: "var(--accent)", marginTop: 6, fontWeight: 600 }}>ADMIN MODE</div>}
        </div>
      </aside>
    </div>
  );
}
