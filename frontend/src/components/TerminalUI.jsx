import React, { useEffect, useRef, useState } from 'react'
import ChatInput from './ChatInput'

function escapeHtml(str){ return str.replace(/[&<>\"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]); }

export default function TerminalUI({ socket, nick, setNick }){
  const [lines, setLines] = useState([]);
  const terminalRef = useRef();

  useEffect(()=>{
    if(!socket) return;
    socket.addEventListener('message', (ev)=>{
      try{ const payload = JSON.parse(ev.data); if(payload.type === 'message') pushLine(`<b>${escapeHtml(payload.nick)}</b> ${new Date(payload.ts).toLocaleTimeString()}\n${escapeHtml(payload.text)}`); else pushLine(`[system] ${escapeHtml(payload.text)}`); }catch(e){ pushLine('[raw] '+ev.data); }
    });
  },[socket]);

  function pushLine(html){ setLines((s)=>[...s, html]); terminalRef.current?.scrollTo({top: terminalRef.current.scrollHeight, behavior:'smooth'}); }

  function send(text){
    if(!text) return;
    if(text.startsWith('/')) return handleCommand(text);
    const msg = { type:'message', nick, text, ts: Date.now() };
    if(socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
    else pushLine(`<b>${escapeHtml(nick)}</b> ${new Date().toLocaleTimeString()}\n${escapeHtml(text)}`);
  }

  function handleCommand(line){
    const parts = line.substring(1).split(/\s+/);
    const cmd = parts.shift();
    const args = parts.join(' ');
    switch(cmd){
      case 'nick': if(args){ setNick(args.substring(0,24)); pushLine(`[system] nickname set to ${escapeHtml(args)}`) } else pushLine('[system] usage: /nick <name>'); break;
      case 'help': pushLine('[system] Commands: /help /nick /me /clear'); break;
      case 'me': pushLine(`* ${escapeHtml(nick)} ${escapeHtml(args)}`); break;
      case 'clear': setLines([]); break;
      default: pushLine('[system] unknown command: '+cmd);
    }
  }

  return (
    <div>
      <div ref={terminalRef} className="bg-[#020807] rounded p-3 min-h-[400px] max-h-[60vh] overflow-auto">
        {lines.map((l,i)=>(<div key={i} className="whitespace-pre-wrap text-sm" dangerouslySetInnerHTML={{__html:l}} />))}
      </div>
      <ChatInput onSend={send} />
    </div>
  )
}
