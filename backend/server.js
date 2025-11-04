// server.js
// TerminusChat — WS server with persistent usernames and chat history.
// Place usernames.json and messages.json next to this file (they can start as {} and [] respectively)

const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { randomBytes } = require('crypto');

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || '4076af225ada1d4c65e03f8563be2c46';
const MAX_HISTORY = Number(process.env.MAX_HISTORY) || 500;

const dataDir = __dirname;
const usernamesFile = path.join(dataDir, 'usernames.json');
const messagesFile = path.join(dataDir, 'messages.json');

let usernames = {};
let history = [];

// load usernames if present
try {
  if (fs.existsSync(usernamesFile)) {
    usernames = JSON.parse(fs.readFileSync(usernamesFile, 'utf8') || '{}');
  }
} catch (e) {
  console.error('Failed to read usernames.json:', e);
  usernames = {};
}

// load message history if present
try {
  if (fs.existsSync(messagesFile)) {
    history = JSON.parse(fs.readFileSync(messagesFile, 'utf8') || '[]');
    if (!Array.isArray(history)) history = [];
  }
} catch (e) {
  console.error('Failed to read messages.json:', e);
  history = [];
}

function saveUsernames() {
  try {
    fs.writeFileSync(usernamesFile, JSON.stringify(usernames, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save usernames.json:', e);
  }
}
function saveHistory() {
  try {
    fs.writeFileSync(messagesFile, JSON.stringify(history, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save messages.json:', e);
  }
}

function makeClientId() {
  return randomBytes(12).toString('hex');
}

const wss = new WebSocket.Server({ port: PORT });

// Broadcast helper
function broadcast(obj, except = null) {
  const data = JSON.stringify(obj);
  for (const c of wss.clients) {
    if (c.readyState === WebSocket.OPEN && c !== except) {
      try { c.send(data); } catch (e) { /* ignore send errors */ }
    }
  }
}

// send user-list to all
function broadcastUserList() {
  const list = [];
  for (const c of wss.clients) {
    if (c.readyState === WebSocket.OPEN) {
      list.push({ nick: c.nick || 'guest', isAdmin: !!c.isAdmin, clientId: c.clientId || null });
    }
  }
  broadcast({ type: 'user-list', users: list });
}

// find client by nickname (exact match)
function findClientByNick(nick) {
  for (const c of wss.clients) {
    if (c.readyState === WebSocket.OPEN && c.nick === nick) return c;
  }
  return null;
}

// ensure item has ts and type and push to history (for public messages & system messages)
function pushHistory(item) {
  const safe = {
    type: item.type || 'system',
    text: item.text || '',
    nick: item.nick || null,
    ts: item.ts || Date.now()
  };
  history.push(safe);
  if (history.length > MAX_HISTORY) {
    history = history.slice(history.length - MAX_HISTORY);
  }
  saveHistory();
}

// Send history to a single ws client (most recent first or preserve order)
function sendHistoryTo(ws) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify({ type: 'history', history: history.slice(-MAX_HISTORY) }));
  } catch (e) { /* ignore */ }
}

wss.on('connection', (ws) => {
  ws.isAdmin = false;
  ws.clientId = null;
  ws.nick = 'guest_' + Math.floor(Math.random() * 10000);

  // send a private welcome (simplified) and current history (client should render history)
  try {
    ws.send(JSON.stringify({ type: 'system', text: 'Welcome to TerminusChat.' }));
    sendHistoryTo(ws);
  } catch (e) { /* ignore */ }

  // inform others of new connection
  broadcastUserList();

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) {
      try { ws.send(JSON.stringify({ type: 'system', text: 'Invalid JSON message.' })); } catch {}
      return;
    }

    // IDENTIFY: client provides clientId + nick to restore mapping
    if (msg.type === 'identify') {
      let clientId = typeof msg.clientId === 'string' && msg.clientId.trim() ? msg.clientId.trim() : makeClientId();
      let nick = typeof msg.nick === 'string' && msg.nick.trim() ? msg.nick.trim().substring(0,48) : ws.nick;

      ws.clientId = clientId;
      ws.nick = nick || ws.nick;

      // persist mapping
      usernames[clientId] = { nick: ws.nick, lastSeen: Date.now() };
      saveUsernames();

      // reply only to this client with confirmation and assigned clientId
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'identified', clientId, nick: ws.nick })); } catch {}
      }

      // send history again now that we've set nick (client may want to render after identify)
      sendHistoryTo(ws);

      // broadcast updated presence
      broadcastUserList();
      return;
    }

    // NICK change
    if (msg.type === 'nick') {
      const old = ws.nick;
      const newNick = (msg.newNick || '').toString().trim().substring(0, 48) || old;
      ws.nick = newNick;

      if (ws.clientId) {
        usernames[ws.clientId] = usernames[ws.clientId] || {};
        usernames[ws.clientId].nick = ws.nick;
        usernames[ws.clientId].lastSeen = Date.now();
        saveUsernames();
      }

      // private confirmation to invoker
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'system', text: `Your nickname is now ${ws.nick}` })); } catch {}
      }
      // broadcast updated user-list
      broadcastUserList();
      return;
    }

    // LOGIN / LOGOUT admin
    if (msg.type === 'login') {
      if (msg.key === ADMIN_KEY) {
        ws.isAdmin = true;
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'admin-status', value: true }));
            ws.send(JSON.stringify({ type: 'system', text: 'Admin privileges granted.' }));
          } catch {}
        }
        broadcastUserList();
      } else {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(JSON.stringify({ type: 'system', text: 'Invalid admin key.' })); } catch {}
        }
      }
      return;
    }
    if (msg.type === 'logout') {
      ws.isAdmin = false;
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'admin-status', value: false }));
          ws.send(JSON.stringify({ type: 'system', text: 'Logged out of admin mode.' }));
        } catch {}
      }
      broadcastUserList();
      return;
    }

    // CLEAR chat
    if (msg.type === 'clear') {
      if (ws.isAdmin) {
        history = [];
        saveHistory();
        broadcast({ type: 'clear' });
        const sys = { type: 'system', text: `[ADMIN] Global chat cleared by ${ws.nick}.`, ts: Date.now() };
        pushHistory(sys); // persist the system message for history
        broadcast(sys);
      } else {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(JSON.stringify({ type: 'system', text: 'You are not authorized to clear chat globally.' })); } catch {}
        }
      }
      return;
    }

    // PRIVATE / PM
    if (msg.type === 'private' || msg.type === 'pm') {
      const to = (msg.to || '').toString();
      const text = (msg.text || '').toString().substring(0, 2000);
      const recip = findClientByNick(to);
      const payload = { type: 'pm', from: ws.nick, to, text, ts: Date.now() };
      // deliver to recipient if online
      if (recip && recip.readyState === WebSocket.OPEN) {
        try { recip.send(JSON.stringify(payload)); } catch {}
      }
      // echo back to sender as confirmation
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify(payload)); } catch {}
      }
      // private messages are NOT stored in public history
      return;
    }

    // GLOBAL public message
    if (msg.type === 'message') {
      const text = (msg.text || '').toString().substring(0, 2000);
      const out = { type: 'message', nick: ws.nick, text, ts: Date.now() };
      pushHistory(out);         // persist public message
      broadcast(out);          // broadcast to all
      return;
    }

    // unknown -> respond privately
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: 'system', text: 'Unknown command or message type.' })); } catch {}
    }
  });

  ws.on('close', () => {
    if (ws.clientId) {
      usernames[ws.clientId] = usernames[ws.clientId] || {};
      usernames[ws.clientId].nick = ws.nick;
      usernames[ws.clientId].lastSeen = Date.now();
      saveUsernames();
    }
    broadcastUserList();
  });
});

console.log(`TerminusChat WS server running on port ${PORT}`);
