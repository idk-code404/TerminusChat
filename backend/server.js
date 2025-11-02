// server.js
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "secret123"; // set via env in prod

const usernamesFile = path.join(__dirname, 'usernames.json');
let usernames = {};

if (fs.existsSync(usernamesFile)) {
  try { usernames = JSON.parse(fs.readFileSync(usernamesFile,'utf8')); } 
  catch(e){ usernames = {}; }
}

function saveUsernames() {
  fs.writeFileSync(usernamesFile, JSON.stringify(usernames, null, 2));
}

const wss = new WebSocket.Server({ port: PORT });

function broadcast(obj, except=null){
  const data = JSON.stringify(obj);
  for(const c of wss.clients){
    if(c.readyState===WebSocket.OPEN && c!==except) c.send(data);
  }
}

function findClientByNick(nick){
  for(const c of wss.clients){
    if(c.readyState===WebSocket.OPEN && c.nick===nick) return c;
  }
  return null;
}

function broadcastUserList(){
  const list = [];
  for(const c of wss.clients){
    if(c.readyState===WebSocket.OPEN){
      list.push({nick: c.nick, isAdmin: c.isAdmin||false});
    }
  }
  broadcast({type:"user-list", users: list});
}

wss.on("connection", ws => {
  ws.nick = "guest";
  ws.isAdmin = false;

  const addr = ws._socket.remoteAddress || "unknown";
  if(usernames[addr]?.nick) ws.nick = usernames[addr].nick;
  broadcast({type:"system", text:`${ws.nick} connected`});
  broadcastUserList();

  ws.send(JSON.stringify({type:"history", history: []}));

  ws.on("message", raw => {
    let msg;
    try{ msg = JSON.parse(raw); } catch { return; }

    if(msg.type==="nick"){
      ws.nick = msg.newNick.substring(0,24);
      usernames[addr] = {nick: ws.nick, lastSeen: Date.now()};
      saveUsernames();
      broadcast({type:"system", text:`User changed nickname to ${ws.nick}`});
      broadcastUserList();
    }
    else if(msg.type==="message"){
      const out = {type:"message", nick: ws.nick, text: msg.text, ts: Date.now()};
      broadcast(out);
    }
    else if(msg.type==="private"){
      const target = findClientByNick(msg.to);
      if(target){
        const payload = {type:"private", from: ws.nick, to: msg.to, text: msg.text};
        target.send(JSON.stringify(payload));
        ws.send(JSON.stringify(payload));
      } else {
        ws.send(JSON.stringify({type:"system", text:`User ${msg.to} not found`}));
      }
    }
    else if(msg.type==="login"){
      if(msg.key===ADMIN_KEY){
        ws.isAdmin = true;
        ws.send(JSON.stringify({type:"admin-status", value:true}));
        broadcastUserList();
        ws.send(JSON.stringify({type:"system", text:"Admin access granted"}));
      } else {
        ws.send(JSON.stringify({type:"system", text:"Invalid admin key"}));
      }
    }
    else if(msg.type==="logout"){
      ws.isAdmin = false;
      ws.send(JSON.stringify({type:"admin-status", value:false}));
      broadcastUserList();
      ws.send(JSON.stringify({type:"system", text:"Logged out of admin"}));
    }
    else if(msg.type==="clear"){
      if(ws.isAdmin){
        broadcast({type:"clear"});
      }
    }
  });

  ws.on("close", ()=>{
    broadcast({type:"system", text:`${ws.nick} disconnected`});
    broadcastUserList();
  });
});

console.log(`TerminusChat WS server running on port ${PORT}`);
