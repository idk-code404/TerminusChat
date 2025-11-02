// frontend/src/components/TerminalUI.jsx
import React, { useEffect, useRef, useState } from 'react'
import ChatInput from './ChatInput'

function escapeHtml(str){ return str.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]); }

export default function TerminalUI({ socket, nick, setNick }) {
  const [lines, setLines] = useState([]); // all messages
  const [users, setUsers] = useState([]); // online user list
  const [target, setTarget] = useState('global'); // 'global' or username
  const terminalRef = useRef();

  // scroll helper
  function pushLine(obj) {
    // obj: {kind:'message'|'private'|'system', html: '...' , meta...}
    setLines((s)=>[...s, obj]);
    setTimeout(()=>terminalRef.current?.scrollTo({top: terminalRef.current.scrollHeight, behavior:'smooth'}), 10);
  }

  // send identify when socket available or when nick changes
  useEffect(()=>{
    if(!socket) return;
    function tryIdentify() {
      if(socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'identify', nick }));
      }
    }
    // identify now and when opened
    tryIdentify();
    socket.addEventListener('open', tryIdentify);
    return ()=> socket.removeEventListener('open', tryIdentify);
  }, [socket, nick]);

  // incoming messages
  useEffect(()=>{
    if(!socket) return;
    const handler = (ev) => {
      try {
        const payload = JSON.parse(ev.data);
        if(payload.type === 'message' && payload.room === 'global') {
          pushLine({ kind: 'message', html:`<b>${escapeHtml(payload.nick)}</b> ${new Date(payload.ts).toLocaleTimeString()}\\n${escapeHtml(payload.text)}`, meta: payload });
        } else if (payload.type === 'private') {
          // show private messages only if sender or recipient is me
          const me = nick;
          if (payload.nick === me || payload.to === me) {
            pushLine({ kind: 'private', html:`<i>private</i> <b>${escapeHtml(payload.nick)}</b> -> <b>${escapeHtml(payload.to)}</b> ${new Date(payload.ts).toLocaleTimeString()}\\n${escapeHtml(payload.text)}`, meta: payload });
          }
        } else if (payload.type === 'system') {
          pushLine({ kind: 'system', html:`<span class="meta">[system] ${escapeHtml(payload.text)}</span>`, meta: payload });
        } else if (payload.type === 'presence') {
          setUsers(payload.users || []);
        }
      } catch(e) {
        pushLine({ kind:'system', html: '[raw] ' + ev.data });
      }
    };
    socket.addEventListener('message', handler);
    return ()=> socket.removeEventListener('message', handler);
  }, [socket, nick]);

  function send(text) {
    if(!text) return;
    // support slash /msg user text or /pm user text
    if(text.startsWith('/')) {
      const [cmd, ...rest] = text.substring(1).split(/\s+/);
      const restText = rest.join(' ');
      if(cmd === 'msg' || cmd === 'pm') {
        const to = rest.shift();
        const msgText = rest.join(' ');
        if(!to || !msgText) {
          pushLine({ kind:'system', html: '[system] usage: /msg username message' });
          return;
        }
        const payload = { type:'private', to, text: msgText, nick };
        if(socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
        else pushLine({ kind:'private', html: `<i>private</i> <b>${escapeHtml(nick)}</b> -> <b>${escapeHtml(to)}</b> ${new Date().toLocaleTimeString()}\\n${escapeHtml(msgText)}` });
        return;
      }
      if(cmd === 'global') {
        setTarget('global');
        pushLine({ kind:'system', html:'[system] switched to global chat' });
        return;
      }
      // other commands fallback to normal message
    }

    // if target is a username => send private
    if(target !== 'global') {
      const payload = { type:'private', to: target, text, nick };
      if(socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
      else pushLine({ kind:'private', html:`<i>private</i> <b>${escapeHtml(nick)}</b> -> <b>${escapeHtml(target)}</b> ${new Date().toLocaleTimeString()}\\n${escapeHtml(text)}` });
      return;
    }

    // else send global
    const payload = { type:'message', text, nick };
    if(socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
    else pushLine({ kind:'message', html:`<b>${escapeHtml(nick)}</b> ${new Date().toLocaleTimeString()}\\n${escapeHtml(text)}` });
  }

  // filter lines to show: if target is global => show messages.kind === 'message' || system
  // if target is username => show messages where private and involve that user (either from or to) OR system
  function visibleLines() {
    if(target === 'global') return lines.filter(l => l.kind === 'message' || l.kind === 'system');
    return lines.filter(l => {
      if(l.kind === 'system') return true;
      if(l.kind === 'private') {
        const meta = l.meta;
        // meta.nick is sender, meta.to is recipient
        return (meta.nick === target) || (meta.to === target) || (meta.nick === nick) || (meta.to === nick);
      }
      return false;
    });
  }

  return (
    <div className="flex gap-4">
      <div style={{flex:1}}>
        <div ref={terminalRef} className="bg-[#020807] rounded p-3 min-h-[400px] max-h-[60vh] overflow-auto">
          {visibleLines().map((l,i)=>(<div key={i} className="whitespace-pre-wrap text-sm" dangerouslySetInnerHTML={{__html:l.html}} />))}
        </div>

        <div className="flex items-center gap-3 mt-2">
          <div className="text-sm">Chat:</div>
          <button className={`px-2 py-1 rounded ${target==='global' ? 'bg-[#00140a] text-[#00ff6a]' : 'bg-[#071013]'}`} onClick={()=>setTarget('global')}>Global</button>
          <div className="text-sm ml-4">Private with:</div>
          <div style={{display:'flex', gap:8, overflowX:'auto', paddingLeft:8}}>
            {users.filter(u => u !== nick).map(u=>(
              <button key={u} onClick={()=>setTarget(u)} className={`px-2 py-1 rounded ${target===u ? 'bg-[#00140a] text-[#00ff6a]' : 'bg-[#071013]'}`}>{u}</button>
            ))}
          </div>
          <div style={{marginLeft:'auto'}} className="text-sm">You: <b>{nick}</b></div>
        </div>

        <ChatInput onSend={send} />
      </div>

      <aside style={{width:260}} className="bg-[#061010] p-3 rounded">
        <div className="text-sm mb-2">Online users</div>
        <div style={{display:'flex', flexDirection:'column', gap:6}}>
          {users.map(u => (
            <div key={u} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px', background: u===nick ? 'rgba(0,255,106,0.06)' : 'transparent'}} >
              <div>{u}</div>
              <div><button onClick={()=>setTarget(u)} className="px-2 py-1 rounded">Chat</button></div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
