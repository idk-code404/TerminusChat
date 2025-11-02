// frontend/src/components/ChatInput.jsx
import React, { useState } from 'react'

export default function ChatInput({ onSend }){
  const [text, setText] = useState('');
  return (
    <div className="flex gap-2 mt-3">
      <input
        className="flex-1 bg-[#00140a] p-2 rounded text-sm text-[#cfeedd]"
        value={text}
        onChange={(e)=>setText(e.target.value)}
        onKeyDown={(e)=>{ if(e.key==='Enter'){ e.preventDefault(); if(text.trim()){ onSend(text.trim()); setText(''); } } }}
        placeholder="Type a message or /msg <user> <text> or click a username to chat privately"
      />
      <button className="bg-[#00140a] px-4 py-2 rounded text-[#00ff6a]" onClick={()=>{ if(text.trim()){ onSend(text.trim()); setText(''); } }}>Send</button>
    </div>
  )
}
