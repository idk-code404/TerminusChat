// server.js — robust WS server with HTTP health route + persistent usernames.json
// Place usernames.json in same folder or server will create it.
// WARNING: usernames.json is a simple dev store. Use a DB for production.

const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { randomBytes } = require('crypto');

const PORT = parseInt(process.env.PORT || '3000', 10);
const ADMIN_KEY = process.env.ADMIN_KEY || 'supersecret123';

const DATA_DIR = path.resolve(__dirname);
const USERNAMES_FILE = path.join(DATA_DIR, 'usernames.json');

let usernames = {};

// Ensure usernames.json exists (create if missing)
function ensureUsernamesFile() {
  try {
    if (!fs.existsSync(USERNAMES_FILE)) {
      fs.writeFileSync(USERNAMES_FILE, JSON.stringify({}, null, 2), { encoding: 'utf8' });
      console.info('Created usernames.json');
    }
    const raw = fs.readFileSync(USERNAMES_FILE, 'utf8') || '{}';
    usernames = JSON.parse(raw);
    console.info('Loaded usernames.json, entries:', Object.keys(usernames).length);
  } catch (err) {
    console.error('Fatal: could not read or create usernames.json:', err);
    // throw so process exits and logs show reason
    throw err;
  }
}

function saveUsernames() {
  try {
    fs.writeFileSync(USERNAMES_FILE, JSON.stringify(usernames, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save usernames.json:', e);
  }
}

function makeClientId() {
  return randomBytes(12).toString('hex');
}

// Small HTTP server so hosts expecting HTTP don't immediately fail
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'TerminusChat', timestamp: Date.now() }));
    return;
  }
  res.writeHead(404);
  res.end();
});

let wss;

function broadcast(obj, except = null) {
  const data = JSON.stringify(obj);
  for (const c of wss.clients) {
    try {
      if (c.readyState === WebSocket.OPEN && c !== except) c.send(data);
    } catch (e) {
      console.warn('Failed to send to client:', e && e.message);
    }
  }
}

function broadcastUserList() {
  const list = [];
  for (const c of wss.clients) {
    if (c.readyState === WebSocket.OPEN) {
      list.push({ nick: c.nick || 'guest', isAdmin: !!c.isAdmin, clientId: c.clientId || null });
    }
  }
  broadcast({ type: 'user-list', users: list });
}

function findClientByNick(nick) {
  for (const c of wss.clients) {
    if (c.readyState === WebSocket.OPEN && c.nick === nick) return c;
  }
  return null;
}

function start() {
  ensureUsernamesFile();

  wss = new WebSocket.Server({ server });

  wss.on('connection', (ws) => {
    ws.isAdmin = false;
    ws.clientId = null;
    ws.nick = 'guest_' + Math.floor(Math.random() * 10000);

    // private welcome (not a global system echo)
    try { ws.send(JSON.stringify({ type: 'system', text: 'Welcome to TerminusChat (send identify to restore name).' })); } catch (e) {}

    broadcastUserList();

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch (e) { 
        try { ws.send(JSON.stringify({ type: 'system', text: 'Invalid JSON' })); } catch {}
        return; 
      }

      // Identify message to restore/save clientId -> nick mapping
      if (msg.type === 'identify') {
        let clientId = typeof msg.clientId === 'string' && msg.clientId.trim() ? msg.clientId.trim() : makeClientId();
        let nick = typeof msg.nick === 'string' ? msg.nick.trim().substring(0, 48) : ws.nick;
        ws.clientId = clientId;
        ws.nick = nick || ws.nick;
        usernames[clientId] = { nick: ws.nick, lastSeen: Date.now() };
        saveUsernames();
        try { ws.send(JSON.stringify({ type: 'identified', clientId, nick: ws.nick })); } catch (e) {}
        broadcastUserList();
        return;
      }

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
        try { ws.send(JSON.stringify({ type: 'system', text: `Your nickname is now ${ws.nick}` })); } catch (e) {}
        broadcastUserList();
        return;
      }

      if (msg.type === 'login') {
        if (msg.key === ADMIN_KEY) {
          ws.isAdmin = true;
          try { ws.send(JSON.stringify({ type: 'admin-status', value: true })); ws.send(JSON.stringify({ type: 'system', text: 'Admin privileges granted.' })); } catch {}
          broadcastUserList();
        } else {
          try { ws.send(JSON.stringify({ type: 'system', text: 'Invalid admin key.' })); } catch {}
        }
        return;
      }

      if (msg.type === 'logout') {
        ws.isAdmin = false;
        try { ws.send(JSON.stringify({ type: 'admin-status', value: false })); ws.send(JSON.stringify({ type: 'system', text: 'Logged out of admin mode.' })); } catch {}
        broadcastUserList();
        return;
      }

      if (msg.type === 'clear') {
        if (ws.isAdmin) {
          broadcast({ type: 'clear' });
          broadcast({ type: 'system', text: `[ADMIN] Global chat cleared by ${ws.nick}.` });
        } else {
          try { ws.send(JSON.stringify({ type: 'system', text: 'You are not authorized to clear chat globally.' })); } catch {}
        }
        return;
      }

      if (msg.type === 'private' || msg.type === 'pm') {
        const to = (msg.to || '').toString();
        const text = (msg.text || '').toString().substring(0, 2000);
        const recip = findClientByNick(to);
        const payload = { type: 'pm', from: ws.nick, to, text, ts: Date.now() };
        if (recip && recip.readyState === WebSocket.OPEN) recip.send(JSON.stringify(payload));
        // echo to sender as confirmation
        try { ws.send(JSON.stringify(payload)); } catch {}
        return;
      }

      if (msg.type === 'message') {
        const text = (msg.text || '').toString().substring(0, 2000);
        const out = { type: 'message', nick: ws.nick, text, ts: Date.now() };
        broadcast(out);
        return;
      }

      // unknown type
      try { ws.send(JSON.stringify({ type: 'system', text: 'Unknown command or message type.' })); } catch {}
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

    ws.on('error', (err) => {
      console.warn('Client socket error:', err && err.message);
    });
  });

  server.listen(PORT, () => {
    console.log(`TerminusChat server listening on port ${PORT}`);
  });
}

// Global error handlers to surface debugging info in logs
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err && err.stack ? err.stack : err);
  // keep process alive if desired, or exit to allow restart
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});

// Start the server and catch startup errors
try {
  start();
} catch (e) {
  console.error('Startup failed:', e && e.stack ? e.stack : e);
  process.exit(1);
}
