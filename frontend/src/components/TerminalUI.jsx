import React, { useState, useEffect, useRef } from "react";

export default function TerminalUI({ socket, nick, setNick }) {
  const terminalRef = useRef(null);
  const inputRef = useRef(null);
  const [lines, setLines] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState([]);
  const [unreadPMs, setUnreadPMs] = useState({}); // {nick: count}

  const pmSound = useRef(null);
  useEffect(() => { pmSound.current = new Audio("/notification.mp3"); }, []);

  const appendLine = (html) => setLines(prev => [...prev, html]);
  const escapeHtml = (str) =>
    str.replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));

  // WebSocket listener
  useEffect(() => {
    if (!socket) return;
    const onMsg = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "message") {
          appendLine(`<span class='nick'>${msg.nick}</span>: ${escapeHtml(msg.text)}`);
        } 
        else if (msg.type === "private") {
          appendLine(`<span class='meta' style="color:#ff0;">(private)</span> <span class='nick'>${msg.from}</span> → <span class='nick'>${msg.to}</span>: ${escapeHtml(msg.text)}`);
          setUnreadPMs(prev => ({...prev, [msg.from]: (prev[msg.from]||0) + 1 }));
          document.title = `📩 New PM!`;
          if (pmSound.current) pmSound.current.play();
        } 
        else if (msg.type === "system") {
          appendLine(`<span class='meta'>[system]</span> ${escapeHtml(msg.text)}`);
        }
        else if (msg.type === "history") {
          msg.history.forEach(m => appendLine(`<span class='nick'>${m.nick}</span>: ${escapeHtml(m.text)}`));
        }
        else if (msg.type === "clear") {
          setLines([]);
        }
        else if (msg.type === "user-list") {
          setUsers(msg.users);
        }
        else if (msg.type === "admin-status") {
          setIsAdmin(msg.value);
        }
      } catch {}
    };
    socket.addEventListener("message", onMsg);
    return () => socket.removeEventListener("message", onMsg);
  }, [socket]);

  // Clear PM notifications on focus
  useEffect(() => {
    const onFocus = () => {
      setUnreadPMs({});
      document.title = "TerminusChat";
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const handleCommand = (line) => {
    const [cmd, ...rest] = line.trim().substring(1).split(/\s+/);
    const args = rest.join(" ");

    switch (cmd) {
      case "help":
        appendLine(`<span class='meta'>Commands: /help, /nick <name>, /me <action>, /msg <user> <text>, /login <key>, /logout, /clear</span>`);
        break;
      case "nick":
        if (!args) return appendLine("<span class='meta'>Usage: /nick <name></span>");
        setNick(args);
        localStorage.setItem("nick", args);
        socket.send(JSON.stringify({type:"nick", newNick: args}));
        appendLine(`<span class='meta'>Nickname changed to ${args}</span>`);
        break;
      case "me":
        if (!args) return appendLine("<span class='meta'>Usage: /me <action></span>");
        socket.send(JSON.stringify({type:"message", text:`* ${nick} ${args}`}));
        break;
      case "msg": {
        const [to, ...textParts] = rest;
        const text = textParts.join(" ");
        if (!to || !text) return appendLine("<span class='meta'>Usage: /msg <user> <text></span>");
        socket.send(JSON.stringify({type:"private", to, text}));
        appendLine(`<span class='meta'>(to ${to})</span> ${escapeHtml(text)}`);
        break;
      }
      case "login":
        if (!args) return appendLine("<span class='meta'>Usage: /login <key></span>");
        socket.send(JSON.stringify({type:"login", key: args}));
        break;
      case "logout":
        socket.send(JSON.stringify({type:"logout"}));
        setIsAdmin(false);
        appendLine("<span class='meta'>Logged out of admin mode.</span>");
        break;
      case "clear":
        if (isAdmin) socket.send(JSON.stringify({type:"clear"}));
        else { setLines([]); appendLine("<span class='meta'>(local) chat cleared.</span>"); }
        break;
      default:
        appendLine(`<span class='meta'>Unknown command: /${cmd}</span>`);
    }
  };

  const handleSend = (value) => {
    if (!value) return;
    if (value.startsWith("/")) handleCommand(value);
    else socket.send(JSON.stringify({type:"message", text:value}));
  };

  const handleClickUser = (username) => {
    if(inputRef.current) {
      inputRef.current.value = `/msg ${username} `;
      inputRef.current.focus();
      // Clear unread PM counter for this user
      setUnreadPMs(prev => {
        const copy = {...prev};
        delete copy[username];
        return copy;
      });
    }
  };

  return (
    <div className="flex gap-4">
      <div className="flex-1">
        <div ref={terminalRef} className="h-[60vh] overflow-y-auto font-mono text-sm text-[#cfeedd] bg-black rounded p-2">
          {lines.map((line,i)=><div key={i} dangerouslySetInnerHTML={{__html: line}} />)}
        </div>
        <input
          ref={inputRef}
          type="text"
          className="w-full mt-2 bg-[#020807] border border-[#004d2b] rounded p-2 text-[#cfeedd]"
          placeholder="Type message or /help"
          onKeyDown={e => { if(e.key==="Enter"){ handleSend(e.target.value); e.target.value=""; }}} />
      </div>

      {/* User list panel */}
      <div className="w-56 bg-[#071013] text-[#9db0a5] p-2 rounded overflow-y-auto h-[60vh] font-mono">
        <div className="font-bold mb-2">Users Online</div>
        {users.map(u => (
          <div key={u.nick} className="flex justify-between items-center cursor-pointer hover:bg-[#00140a] p-1 rounded"
               onClick={() => handleClickUser(u.nick)}>
            <span className="truncate">{u.nick}</span>
            <div className="flex items-center gap-1">
              {u.isAdmin && <span className="text-yellow-400 ml-1">[ADMIN]</span>}
              {unreadPMs[u.nick] && <span className="bg-red-600 text-white px-1 rounded text-xs">{unreadPMs[u.nick]}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
