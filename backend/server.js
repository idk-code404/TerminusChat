// server.js
// TerminusChat — WS server with persistent usernames, chat history, moderation, and admin

const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'supersecret123';
const MAX_HISTORY = 200;

const dataDir = __dirname;
const usernamesFile = path.join(dataDir, 'usernames.json');
const messagesFile = path.join(dataDir, 'messages.json');

let usernames = {};
let history = [];

// load usernames if present
if (fs.existsSync(usernamesFile)) {
  usernames = JSON.parse(fs.readFileSync(usernamesFile, 'utf8') || '{}');
}

// load history if present
if (fs.existsSync(messagesFile)) {
  history = JSON.parse(fs.readFileSync(messagesFile, 'utf8') || '[]');
}

// Save helpers
function saveUsernames() {
  fs.writeFileSync(usernamesFile, JSON.stringify(usernames, null, 2));
}
function saveHistory() {
  fs.writeFileSync(messagesFile, JSON.stringify(history.slice(-MAX_HISTORY), null, 2));
}

// Moderation
const bannedWords = ["nigger","faggot","retard","chink","spic","kike","coon","slut","whore"];
function sanitizeMessage(text) {
  let clean = text;
  for (const bad of bannedWords) {
    const regex = new RegExp(`\\b${bad}\\b`, "gi");
    clean = clean.replace(regex, "****");
  }
  return clean;
}

// Broadcast helpers
function broadcast(obj, exclude) {
  const data = JSON.stringify(obj);
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN && c !== exclude) {
      c.send(data);
    }
  });
}

function broadcastUserList() {
  const list = [];
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) {
      list.push({ nick: c.nick, isAdmin: !!c.isAdmin });
    }
  });
  broadcast({ type: 'userList', users: list });
}

function pushHistory(item) {
  history.push(item);
  if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
  saveHistory();
}

function sendHistory(ws) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'history', history }));
  }
}

wss.on('connection', ws => {
  ws.nick = 'guest_' + Math.floor(Math.random() * 10000);
  ws.isAdmin = false;

  ws.send(JSON.stringify({ type: 'system', message: 'Welcome to TerminusChat.' }));
  sendHistory(ws);
  broadcastUserList();

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // Change nickname
    if (msg.type === 'nick') {
      const old = ws.nick;
      ws.nick = sanitizeMessage(msg.newNick || old).substring(0, 48);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'system', message: `Your nickname is now ${ws.nick}` }));
      }
      usernames[ws.nick] = { nick: ws.nick, lastSeen: Date.now() };
      saveUsernames();
      broadcastUserList();
      return;
    }

    // Chat message
    if (msg.type === 'chat') {
      let text = sanitizeMessage(msg.message.trim());
      if (!text) return;

      // Commands
      if (text.startsWith('/')) {
        const [cmd, ...args] = text.slice(1).split(" ");
        switch(cmd.toLowerCase()) {
          case 'help':
            ws.send(JSON.stringify({ type: 'system', message: 'Commands: /help, /msg <user> <message>, /login <key>, /logout, /clear' }));
            break;
          case 'clear':
            if (!ws.isAdmin) {
              ws.send(JSON.stringify({ type: 'system', message: 'You are not authorized.' }));
            } else {
              history = [];
              saveHistory();
              broadcast({ type: 'system', message: `[Admin] Chat cleared by ${ws.nick}` });
            }
            break;
          case 'login':
            if (args[0] === ADMIN_KEY) {
              ws.isAdmin = true;
              ws.send(JSON.stringify({ type: 'system', message: 'Admin access granted.' }));
              broadcastUserList();
            } else {
              ws.send(JSON.stringify({ type: 'system', message: 'Invalid admin key.' }));
            }
            break;
          case 'logout':
            ws.isAdmin = false;
            ws.send(JSON.stringify({ type: 'system', message: 'Admin access revoked.' }));
            broadcastUserList();
            break;
          case 'msg': // private message
            const toNick = args.shift();
            const privateMsg = args.join(" ");
            wss.clients.forEach(c => {
              if (c.nick === toNick && c.readyState === WebSocket.OPEN) {
                c.send(JSON.stringify({ type: 'pm', from: ws.nick, message: sanitizeMessage(privateMsg) }));
              }
            });
            // echo to sender
            ws.send(JSON.stringify({ type: 'pm', from: ws.nick, to: toNick, message: sanitizeMessage(privateMsg) }));
            break;
          default:
            ws.send(JSON.stringify({ type: 'system', message: 'Unknown command.' }));
        }
        return;
      }

      // Public message
      const chatEntry = { type: 'chat', nick: ws.nick, message: text, time: Date.now() };
      pushHistory(chatEntry);
      broadcast(chatEntry);
    }
  });

  ws.on('close', () => {
    broadcastUserList();
  });
});

server.listen(PORT, () => console.log(`✅ TerminusChat WS server running on port ${PORT}`));
