// backend/server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { register, authenticate, verifyToken } = require('./auth');

const app = express();
app.use(bodyParser.json());

const frontendOrigin = process.env.FRONTEND_ORIGIN;
const corsOptions = frontendOrigin ? { origin: frontendOrigin, optionsSuccessStatus: 200 } : {};
app.use(cors(corsOptions));

// Basic REST endpoints (unchanged)
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    await register(username, password);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message || 'registration failed' });
  }
});
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    const token = await authenticate(username, password);
    if (!token) return res.status(401).json({ error: 'invalid credentials' });
    res.json({ token });
  } catch (e) {
    res.status(500).json({ error: 'login failed' });
  }
});

// Serve frontend if built
const distPath = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  console.log('Serving frontend from', distPath);
} else {
  app.get('/', (req, res) => res.send('TerminusChat backend running. WebSocket endpoint available.'));
}

// ---- WebSocket server and message routing ----
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Map username -> ws for private messaging (in-memory)
const users = new Map(); // username => ws
const sockets = new Set(); // all ws

function broadcastPresence() {
  const userList = Array.from(users.keys());
  const payload = JSON.stringify({ type: 'presence', users: userList, ts: Date.now() });
  for (const s of sockets) {
    if (s.readyState === WebSocket.OPEN) s.send(payload);
  }
}

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.username = null; // will be set when client identifies
  sockets.add(ws);

  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch (e) { return; }

    // IDENTIFY: client tells server its chosen nickname (demo only)
    if (msg.type === 'identify' && msg.nick && typeof msg.nick === 'string') {
      // if the username is already taken by another socket, replace it (or you can reject)
      // remove previous mapping of this ws if exists
      if (ws.username && users.get(ws.username) === ws) users.delete(ws.username);

      ws.username = msg.nick.substring(0, 32);
      users.set(ws.username, ws);
      // notify this socket
      ws.send(JSON.stringify({ type: 'system', text: `Identified as ${ws.username}`, ts: Date.now() }));
      broadcastPresence();
      return;
    }

    // GLOBAL MESSAGE
    if (msg.type === 'message') {
      if (typeof msg.text !== 'string' || msg.text.length > 2000) return;
      const out = {
        type: 'message',
        room: 'global',
        nick: ws.username || (msg.nick || 'anon'),
        text: msg.text.substring(0, 2000),
        ts: Date.now()
      };
      const payload = JSON.stringify(out);
      for (const s of sockets) if (s.readyState === WebSocket.OPEN) s.send(payload);
      return;
    }

    // PRIVATE MESSAGE
    if (msg.type === 'private') {
      if (typeof msg.text !== 'string' || msg.text.length > 2000) return;
      if (!msg.to || typeof msg.to !== 'string') return;
      const to = msg.to;
      const from = ws.username || (msg.nick || 'anon');
      const out = {
        type: 'private',
        nick: from,
        to,
        text: msg.text.substring(0, 2000),
        ts: Date.now()
      };
      const payload = JSON.stringify(out);
      // send to recipient
      const recip = users.get(to);
      if (recip && recip.readyState === WebSocket.OPEN) recip.send(payload);
      // send a copy to sender (so sender sees the private message in their UI)
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      return;
    }

    // other message types (typing, heartbeat, etc.) could go here...
  });

  ws.send(JSON.stringify({ type: 'system', text: 'Connected to TerminusChat', ts: Date.now() }));

  ws.on('close', () => {
    sockets.delete(ws);
    if (ws.username && users.get(ws.username) === ws) {
      users.delete(ws.username);
      broadcastPresence();
    }
  });
});

// Ping/pong cleanup
const interval = setInterval(() => {
  for (const ws of sockets) {
    if (!ws.isAlive) {
      ws.terminate();
    } else {
      ws.isAlive = false;
      ws.ping();
    }
  }
}, 30000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// graceful shutdown
function shutdown() {
  clearInterval(interval);
  console.log('Shutting down...');
  wss.close(() => server.close(() => process.exit(0)));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

