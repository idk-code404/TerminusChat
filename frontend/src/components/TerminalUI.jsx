import React, { useEffect, useRef, useState } from "react";

/**
 * TerminalUI
 *
 * Props:
 *  - socket: WebSocket instance (may be null until connected)
 *  - nick: current nickname (string)
 *  - setNick: function(newNick) -> updates nickname in parent (and persists)
 */
export default function TerminalUI({ socket, nick, setNick }) {
  const terminalRef = useRef(null);
  const inputRef = useRef(null);
  const [lines, setLines] = useState([]); // array of HTML strings
  const [users, setUsers] = useState([]); // array of {nick, isAdmin}
  const [unreadPMs, setUnreadPMs] = useState({}); // { nick: count }
  const [isAdmin, setIsAdmin] = useState(false);
  const pmSound = useRef(null);

  // load PM sound (optional file: /notification.mp3)
  useEffect(() => {
    try {
      pmSound.current = new Audio("/notification.mp3");
      pmSound.current.preload = "auto";
    } catch (e) {
      pmSound.current = null;
    }
  }, []);

  // helper: escape HTML
  const escapeHtml = (str = "") =>
    String(str).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  // Append line safely and scroll
  const appendLine = (html) => {
    setLines((prev) => {
      const out = [...prev, html];
      // keep history reasonable client-side
      return out.slice(-1000);
    });
  };

  // scroll to bottom when lines update
  useEffect(() => {
    const el = terminalRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  // Handle incoming socket messages
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
        case "message": {
          const html = `<span class="nick">${escapeHtml(payload.nick)}</span>: ${escapeHtml(payload.text)}`;
          appendLine(html);
          break;
        }

        case "private": {
          // payload: { type: 'private', from, to, text, ts? }
          const html = `<span class="meta" style="color:#ff0;">(private)</span> <span class="nick">${escapeHtml(payload.from)}</span> → <span class="nick">${escapeHtml(payload.to)}</span>: ${escapeHtml(payload.text)}`;
          appendLine(html);

          // only treat as unread if it's to me and NOT sent by myself
          if (payload.to === nick && payload.from !== nick) {
            setUnreadPMs((prev) => {
              const cur = prev[payload.from] || 0;
              return { ...prev, [payload.from]: cur + 1 };
            });

            // update document title & play sound
            document.title = `📩 New PM from ${payload.from}`;
            try {
              pmSound.current && pmSound.current.play();
            } catch (e) {
              /* ignore autoplay errors */
            }
          }
          break;
        }

        case "system": {
          appendLine(`<span class="meta">[system]</span> ${escapeHtml(payload.text)}`);
          break;
        }

        case "history": {
          // payload.history is an array of messages
          if (Array.isArray(payload.history)) {
            payload.history.forEach((m) => {
              if (m.type === "message") {
                appendLine(`<span class="nick">${escapeHtml(m.nick)}</span>: ${escapeHtml(m.text)}`);
              } else if (m.type === "system") {
                appendLine(`<span class="meta">[system]</span> ${escapeHtml(m.text)}`);
              }
            });
          }
          break;
        }

        case "clear": {
          setLines([]);
          break;
        }

        case "user-list": {
          // payload.users: [{nick, isAdmin}, ...]
          setUsers(Array.isArray(payload.users) ? payload.users : []);
          break;
        }

        case "admin-status": {
          setIsAdmin(Boolean(payload.value));
          break;
        }

        case "nick-assign": {
          // optional server message to inform client of assigned nick/id
          if (payload.nick) {
            setNick(payload.nick);
          }
          break;
        }

        default:
          // unknown - show raw
          appendLine(`<span class="meta">[unknown]</span> ${escapeHtml(JSON.stringify(payload))}`);
      }
    };

    socket.addEventListener("message", onMessage);
    return () => {
      socket.removeEventListener("message", onMessage);
    };
  }, [socket, nick, setNick]);

  // When window gains focus, clear generic title warning (but keep per-user counters)
  useEffect(() => {
    const onFocus = () => {
      document.title = "TerminusChat";
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Send current nick to server when socket opens (safe double-send)
  useEffect(() => {
    if (!socket) return;
    const onOpen = () => {
      try {
        socket.send(JSON.stringify({ type: "nick", newNick: nick }));
      } catch {}
    };
    socket.addEventListener("open", onOpen);
    return () => socket.removeEventListener("open", onOpen);
  }, [socket, nick]);

  // COMMAND HANDLING
  const handleCommand = (raw) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const [cmd, ...parts] = trimmed.substring(1).split(/\s+/);
    const args = parts.join(" ");

    switch ((cmd || "").toLowerCase()) {
      case "help":
        appendLine(
          `<span class="meta">Commands: /help, /nick &lt;name&gt;, /me &lt;action&gt;, /msg &lt;user&gt; &lt;text&gt;, /login &lt;key&gt;, /logout, /clear</span>`
        );
        break;

      case "nick":
        if (!args) {
          appendLine(`<span class="meta">Usage: /nick &lt;name&gt;</span>`);
          return;
        }
        {
          const newNick = args.substring(0, 24);
          setNick(newNick); // parent persists to localStorage/cookie
          try {
            socket && socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: "nick", newNick }));
          } catch {}
          appendLine(`<span class="meta">Nickname changed to <span class="nick">${escapeHtml(newNick)}</span></span>`);
        }
        break;

      case "me":
        if (!args) {
          appendLine(`<span class="meta">Usage: /me &lt;action&gt;</span>`);
          return;
        }
        try {
          socket && socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: "message", text: `* ${nick} ${args}` }));
        } catch {}
        break;

      case "msg": {
        const [to, ...rest] = parts;
        const text = rest.join(" ");
        if (!to || !text) {
          appendLine(`<span class="meta">Usage: /msg &lt;user&gt; &lt;text&gt;</span>`);
          return;
        }
        try {
          socket && socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: "private", to, text }));
          appendLine(`<span class="meta">(to ${escapeHtml(to)})</span> ${escapeHtml(text)}`);
        } catch {
          appendLine(`<span class="meta">Failed to send private message.</span>`);
        }
        break;
      }

      case "login":
        if (!args) {
          appendLine(`<span class="meta">Usage: /login &lt;key&gt;</span>`);
          return;
        }
        try {
          socket && socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: "login", key: args }));
        } catch {}
        break;

      case "logout":
        try {
          socket && socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: "logout" }));
          setIsAdmin(false);
          appendLine(`<span class="meta">Logged out of admin mode.</span>`);
        } catch {}
        break;

      case "clear":
        if (isAdmin) {
          try {
            socket && socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: "clear" }));
          } catch {}
        } else {
          setLines([]);
          appendLine(`<span class="meta">(local) chat cleared.</span>`);
        }
        break;

      default:
        appendLine(`<span class="meta">Unknown command: /${escapeHtml(cmd)}</span>`);
    }
  };

  // handle sending typed input
  const handleSend = (value) => {
    if (!value) return;
    if (value.startsWith("/")) {
      handleCommand(value);
    } else {
      try {
        socket && socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: "message", text: value }));
      } catch {
        appendLine("<span class='meta'>Failed to send message (socket closed).</span>");
      }
    }
  };

  // clicking a user to start private message prefill and clear unread badge
  const handleClickUser = (username) => {
    if (!inputRef.current) return;
    inputRef.current.value = `/msg ${username} `;
    inputRef.current.focus();
    // clear unread count for that user
    setUnreadPMs((prev) => {
      if (!prev || !prev[username]) return prev;
      const copy = { ...prev };
      delete copy[username];
      return copy;
    });
    // reset title if no unread remain
    const hasUnread = Object.keys(unreadPMs).some((k) => unreadPMs[k] > 0 && k !== username);
    if (!hasUnread) document.title = "TerminusChat";
  };

  return (
    <div className="flex gap-4">
      {/* Terminal area */}
      <div className="flex-1">
        <div
          ref={terminalRef}
          className="bg-[#020807] rounded p-3 min-h-[400px] max-h-[60vh] overflow-auto font-mono text-sm text-[#cfeedd]"
        >
          {lines.map((l, i) => (
            <div key={i} className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: l }} />
          ))}
        </div>

        <div className="flex gap-2 mt-3">
          <input
            ref={inputRef}
            className="flex-1 bg-[#00140a] p-2 rounded text-sm text-[#cfeedd]"
            placeholder="Type a message or /command (eg. /help or /msg user hello)"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const val = e.target.value;
                e.target.value = "";
                handleSend(val);
              }
            }}
          />
          <button
            className="bg-[#00140a] px-4 py-2 rounded text-[#00ff6a]"
            onClick={() => {
              const val = inputRef.current?.value || "";
              if (val) {
                inputRef.current.value = "";
                handleSend(val);
              }
            }}
          >
            Send
          </button>
        </div>
      </div>

      {/* User list panel */}
      <aside className="w-56 bg-[#071013] text-[#9db0a5] p-2 rounded overflow-y-auto h-[60vh] font-mono">
        <div className="font-bold mb-2">Users Online</div>
        {users.length === 0 && <div className="text-sm text-[#6b786f]">No users online</div>}
        {users.map((u) => (
          <div
            key={u.nick}
            className="flex items-center justify-between gap-2 cursor-pointer hover:bg-[#00140a] p-1 rounded"
            onClick={() => handleClickUser(u.nick)}
            title={`Click to send a private message to ${u.nick}`}
          >
            <div className="truncate">
              <span>{u.nick}</span>
            </div>

            <div className="flex items-center gap-2">
              {u.isAdmin && <span className="text-yellow-400 text-xs">[ADMIN]</span>}
              {unreadPMs[u.nick] ? (
                <span className="bg-red-600 text-white px-2 py-0.5 rounded text-xs">{unreadPMs[u.nick]}</span>
              ) : null}
            </div>
          </div>
        ))}
      </aside>
    </div>
  );
}
