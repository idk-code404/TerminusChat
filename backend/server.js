// server.js
// TerminusChat backend — sends command-system notices only to the invoking user.
// Also handles private messages, admin login/clear, and broadcasts user-list.

const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'supersecret123';

const usernamesFile = path.join(__dirname, 'usernames.json');
let usernames = {};
if (fs.existsSync(usernamesFile)) {
  try { usernames = JSON.parse(fs.readFileSync(usernamesFile, 'utf8')); } catch (e) { usernames = {}; }
}
function saveUsernames() {
  try { fs.writeFileSync(usernamesFile, JSON.stringify(usernames, null, 2)); } catch (e) { console.error('saveUsernames error', e); }
}

const wss = new WebSocket.Server({ port: PORT });

function broadcast(obj, except = null) {
  const data = JSON.stringify(obj);
  for (const c of wss.clients) {
    if (c.readyState === WebSocket.OPEN && c !== except) c.send(data);
  }
}

function broadcastUserList() {
  const list = [];
  for (const c of wss.clients) {
    if (c.readyState === WebSocket.OPEN) list.push({ nick: c.nick || 'guest', isAdmin: !!c.isAdmin });
  }
  broadcast({ type: 'user-list', users: list });
}

function findClientByNick(nick) {
  for (const c of wss.clients) {
    if (c.readyState === WebSocket.OPEN && c.nick === nick) return c;
  }
  return null;
}

wss.on('connection', (ws, req) => {
  ws.isAdmin = false;
  ws.nick = 'guest_' + Math.floor(Math.random() * 10000);

  // try restore from remote address (simple persistence)
  const addr = (req && req.socket && req.socket.remoteAddress) ? req.socket.remoteAddress : 'unknown';
  if (usernames[addr] && usernames[addr].nick) {
    ws.nick = usernames[addr].nick;
  } else {
    usernames[addr] = { nick: ws.nick, lastSeen: Date.now() };
    saveUsernames();
  }

  // send welcome ONLY to this client
  ws.send(JSON.stringify({ type: 'system', text: `Welcome, ${ws.nick}! Type /help for commands.` }));

  // send history? (if implemented) - placeholder empty for now
  ws.send(JSON.stringify({ type: 'history', history: [] }));

  // broadcast user-list to everyone (so UI updates)
  broadcastUserList();

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // NICK CHANGE -> send system notice only to invoking user, update persistence, update user list
    if (msg.type === 'nick') {
      const old = ws.nick;
      const newNick = (msg.newNick || '').toString().substring(0, 24) || old;
      ws.nick = newNick;
      usernames[addr] = { nick: ws.nick, lastSeen: Date.now() };
      saveUsernames();

      // system notice ONLY to this client
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'system', text: `Your nickname is now ${ws.nick}` }));
      }

      // update everyone with updated user list (no system broadcast about name change)
      broadcastUserList();
      return;
    }

    // LOGIN -> verify key, notify only invoking user, and update user list
    if (msg.type === 'login') {
      if (msg.key === ADMIN_KEY) {
        ws.isAdmin = true;
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'admin-status', value: true }));
          ws.send(JSON.stringify({ type: 'system', text: 'Admin privileges granted.' })); // only to invoker
        }
        broadcastUserList();
      } else {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'system', text: 'Invalid admin key.' }));
      }
      return;
    }

    // LOGOUT -> remove admin, notify only invoker, update user list
    if (msg.type === 'logout') {
      ws.isAdmin = false;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'admin-status', value: false }));
        ws.send(JSON.stringify({ type: 'system', text: 'Logged out of admin mode.' }));
      }
      broadcastUserList();
      return;
    }

    // CLEAR -> admin only: broadcast clear and a system notice to everyone (global admin action)
    if (msg.type === 'clear') {
      if (ws.isAdmin) {
        broadcast({ type: 'clear' });
        broadcast({ type: 'system', text: `[ADMIN] Global chat cleared by ${ws.nick}.` });
      } else {
        // not admin -> notify only the invoker that they can't clear globally
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'system', text: 'You are not authorized to clear chat globally.' }));
      }
      return;
    }

    // PRIVATE message /msg -> deliver only to recipient + sender (echo)
    if (msg.type === 'private' || msg.type === 'msg') {
      const to = msg.to;
      const text = (msg.text || '').toString().substring(0, 2000);
      const recip = findClientByNick(to);
      const payload = { type: 'private', from: ws.nick, to, text, ts: Date.now() };
      if (recip && recip.readyState === WebSocket.OPEN) recip.send(JSON.stringify(payload));
      // always echo back to sender as confirmation
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
      return;
    }

    // GLOBAL message -> broadcast
    if (msg.type === 'message') {
      const text = (msg.text || '').toString().substring(0, 2000);
      const out = { type: 'message', nick: ws.nick, text, ts: Date.now() };
      broadcast(out);
      return;
    }

    // unknown -> ignore or optionally reply privately
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'system', text: 'Unknown command or message type.' }));
  });

  ws.on('close', () => {
    // update stored username lastSeen
    usernames[addr] = usernames[addr] || {};
    usernames[addr].nick = ws.nick;
    usernames[addr].lastSeen = Date.now();
    saveUsernames();

    // update presence list for everyone
    broadcastUserList();
  });
});

console.log(`TerminusChat WS server running on port ${PORT}`);
