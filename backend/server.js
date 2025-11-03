import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'changeme123';
const usernamesFile = path.join(__dirname, 'usernames.json');
const reportsFile = path.join(__dirname, 'reports.json');

let usernames = {};
let reports = [];

if (fs.existsSync(usernamesFile)) {
  usernames = JSON.parse(fs.readFileSync(usernamesFile, 'utf8'));
}
if (fs.existsSync(reportsFile)) {
  reports = JSON.parse(fs.readFileSync(reportsFile, 'utf8'));
}

function saveUsernames() {
  fs.writeFileSync(usernamesFile, JSON.stringify(usernames, null, 2));
}
function saveReports() {
  fs.writeFileSync(reportsFile, JSON.stringify(reports, null, 2));
}

app.use(express.static('dist'));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

function broadcast(data, exclude = null) {
  wss.clients.forEach(client => {
    if (client.readyState === 1 && client !== exclude) {
      client.send(JSON.stringify(data));
    }
  });
}

function listOnlineUsers() {
  return [...wss.clients]
    .filter(c => c.nick)
    .map(c => ({ nick: c.nick, admin: !!c.isAdmin }));
}

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  ws.nick = usernames[ip]?.nick || 'guest';
  ws.isAdmin = false;
  ws.lastActive = Date.now();

  ws.send(JSON.stringify({
    type: 'welcome',
    nick: ws.nick,
    users: listOnlineUsers(),
    msg: `Welcome ${ws.nick}!`
  }));

  broadcast({ type: 'system', msg: `${ws.nick} joined the chat.`, users: listOnlineUsers() }, ws);

  ws.on('message', msg => {
    let data;
    try { data = JSON.parse(msg); } catch { return; }

    if (data.type === 'chat') {
      ws.lastActive = Date.now();
      const text = (data.msg || '').trim();

      // /login command
      if (text.startsWith('/login ')) {
        const key = text.split(' ')[1];
        if (key === ADMIN_KEY) {
          ws.isAdmin = true;
          ws.send(JSON.stringify({ type: 'system', msg: '[system] You are now logged in as admin.' }));
        } else {
          ws.send(JSON.stringify({ type: 'system', msg: '[system] Invalid admin key.' }));
        }
        return;
      }

      // /logout
      if (text === '/logout') {
        ws.isAdmin = false;
        ws.send(JSON.stringify({ type: 'system', msg: '[system] Logged out of admin mode.' }));
        return;
      }

      // /clear (admin only)
      if (text === '/clear') {
        if (!ws.isAdmin) return ws.send(JSON.stringify({ type: 'system', msg: '[system] Admin only command.' }));
        broadcast({ type: 'clear' });
        return;
      }

      // /reportbug <description>
      if (text.startsWith('/reportbug ')) {
        const description = text.slice(11).trim();
        if (!description) return ws.send(JSON.stringify({ type: 'system', msg: '[system] Usage: /reportbug <description>' }));
        const report = {
          type: 'bug',
          from: ws.nick,
          message: description,
          time: new Date().toISOString(),
          ip
        };
        reports.push(report);
        saveReports();
        ws.send(JSON.stringify({ type: 'system', msg: '[system] Bug report submitted. Thank you!' }));
        return;
      }

      // /reportuser <username> <reason>
      if (text.startsWith('/reportuser ')) {
        const parts = text.split(' ');
        const target = parts[1];
        const reason = parts.slice(2).join(' ');
        if (!target || !reason) return ws.send(JSON.stringify({ type: 'system', msg: '[system] Usage: /reportuser <username> <reason>' }));
        const report = {
          type: 'user',
          from: ws.nick,
          target,
          reason,
          time: new Date().toISOString(),
          ip
        };
        reports.push(report);
        saveReports();
        ws.send(JSON.stringify({ type: 'system', msg: `[system] Reported ${target} for "${reason}".` }));
        return;
      }

      // /reports (admin only)
      if (text === '/reports') {
        if (!ws.isAdmin) return ws.send(JSON.stringify({ type: 'system', msg: '[system] Admin only command.' }));
        ws.send(JSON.stringify({ type: 'system', msg: '[system] Bug/User Reports:' }));
        reports.forEach((r, i) => {
          ws.send(JSON.stringify({
            type: 'system',
            msg: `[${i + 1}] [${r.type}] From: ${r.from}, Target: ${r.target || '-'}, Msg: ${r.message || r.reason}, Time: ${r.time}`
          }));
        });
        return;
      }

      // /clearreports (admin only)
      if (text === '/clearreports') {
        if (!ws.isAdmin) return ws.send(JSON.stringify({ type: 'system', msg: '[system] Admin only command.' }));
        reports = [];
        saveReports();
        ws.send(JSON.stringify({ type: 'system', msg: '[system] Reports cleared.' }));
        return;
      }

      // Normal chat
      broadcast({ type: 'chat', nick: ws.nick, msg: text });
    }

    if (data.type === 'nick') {
      ws.nick = data.newNick;
      usernames[ip] = { nick: ws.nick, lastSeen: Date.now() };
      saveUsernames();
      broadcast({ type: 'system', msg: `${ws.nick} updated their name.`, users: listOnlineUsers() });
    }
  });

  ws.on('close', () => {
    broadcast({ type: 'system', msg: `${ws.nick} left the chat.`, users: listOnlineUsers() });
  });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
