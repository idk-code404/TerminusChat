const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 3000 });

const CHAT_FILE = path.join(__dirname, 'chat.json');
const USERS_FILE = path.join(__dirname, 'usernames.json');
const ADMIN_KEY = 'supersecret'; // change this

// Load persistent chat and usernames
let chat = [];
let usernames = {};

try { chat = JSON.parse(fs.readFileSync(CHAT_FILE)); } catch {}
try { usernames = JSON.parse(fs.readFileSync(USERS_FILE)); } catch {}

const clients = new Map(); // ws -> {nick, admin}

function saveChat() { fs.writeFileSync(CHAT_FILE, JSON.stringify(chat, null, 2)); }
function saveUsers() { fs.writeFileSync(USERS_FILE, JSON.stringify(usernames, null, 2)); }

// Broadcast to all connected clients
function broadcast(data) {
  const msg = JSON.stringify(data);
  for (let ws of clients.keys()) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

function sendUserList() {
  const list = {};
  for (let [ws, info] of clients.entries()) {
    list[info.nick] = { admin: info.admin };
  }
  broadcast({ type: 'userlist', users: list });
}

wss.on('connection', (ws) => {
  const defaultNick = `guest${Math.floor(Math.random()*1000)}`;
  clients.set(ws, { nick: defaultNick, admin: false });

  // Send persistent chat and current nick
  ws.send(JSON.stringify({ type: 'history', chat }));
  ws.send(JSON.stringify({ type: 'system', text: `Your nickname is now ${defaultNick}` }));
  sendUserList();

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    const userInfo = clients.get(ws);

    switch(msg.type){
      case 'message':
        const chatMsg = { type: 'message', nick: userInfo.nick, text: msg.text, ts: Date.now() };
        chat.push(chatMsg);
        saveChat();
        broadcast(chatMsg);
        break;

      case 'pm':
        const pm = { type: 'pm', from: userInfo.nick, to: msg.to, text: msg.text, ts: Date.now() };
        chat.push(pm); // optionally save PMs in chat.json too
        saveChat();
        // send only to recipient and sender
        for (let [c, info] of clients.entries()) {
          if (c.readyState !== WebSocket.OPEN) continue;
          if (info.nick === pm.to || info.nick === pm.from) c.send(JSON.stringify(pm));
        }
        break;

      case 'nick':
        if (!msg.nick) break;
        const oldNick = userInfo.nick;
        userInfo.nick = msg.nick;
        clients.set(ws, userInfo);
        usernames[userInfo.nick] = userInfo.nick;
        saveUsers();
        ws.send(JSON.stringify({ type: 'system', text: `Your nickname is now ${msg.nick}` }));
        sendUserList();
        break;

      case 'login':
        if (msg.key === ADMIN_KEY) {
          userInfo.admin = true;
          clients.set(ws, userInfo);
          ws.send(JSON.stringify({ type: 'loginResult', ok: true }));
          sendUserList();
        } else ws.send(JSON.stringify({ type: 'loginResult', ok: false }));
        break;

      case 'logout':
        userInfo.admin = false;
        clients.set(ws, userInfo);
        ws.send(JSON.stringify({ type: 'logoutResult' }));
        sendUserList();
        break;

      case 'clear':
        if (!userInfo.admin) break;
        chat = [];
        saveChat();
        broadcast({ type: 'clear' });
        break;
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    sendUserList();
  });
});

console.log('Server running on ws://localhost:3000');
