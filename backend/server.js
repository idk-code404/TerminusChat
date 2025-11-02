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

// Configure CORS: allow FRONTEND_ORIGIN if set, otherwise allow all (dev)
const frontendOrigin = process.env.FRONTEND_ORIGIN;
const corsOptions = frontendOrigin ? { origin: frontendOrigin, optionsSuccessStatus: 200 } : {};
app.use(cors(corsOptions));

// ---------- REST endpoints (API) ----------
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

// ---------- Static frontend serving (if built) ----------
const distPath = path.join(__dirname, '..', 'frontend', 'dist');

if (fs.existsSync(distPath)) {
  // Serve static assets
  app.use(express.static(distPath));

  // For Single Page App: return index.html for any unknown GET route (client-side routing)
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  console.log('Serving frontend from', distPath);
} else {
  // Minimal health/root route when frontend hasn't been built/deployed to this service
  app.get('/', (req, res) => {
    res.send('TerminusChat backend running. WebSocket endpoint available.');
  });
}

// ---------- Create HTTP server and WebSocket server ----------
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// In-memory clients set (demo). Replace with a proper pub/sub for scale.
const clients = new Set();

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  // Optionally, you can check auth here using cookies / JWT in query/header:
  // const token = extractTokenFromReq(req);
  // if (tokenInvalid) { ws.terminate(); return; }

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'message') {
        // Basic server-side validation
        if (typeof msg.text !== 'string' || msg.text.length > 2000) return;
        const out = {
          type: 'message',
          nick: msg.nick || 'anon',
          text: msg.text.substring(0, 2000),
          ts: Date.now(),
        };
        // Broadcast to all connected clients
        for (const c of clients) {
          if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(out));
        }
      }
    } catch (e) {
      // ignore invalid JSON
    }
  });

  clients.add(ws);
  ws.send(JSON.stringify({ type: 'system', text: 'Connected to TerminusChat', ts: Date.now() }));

  ws.on('close', () => clients.delete(ws));
});

// Ping/pong to detect dead clients (cleanup)
const interval = setInterval(() => {
  for (const ws of clients) {
    if (!ws.isAlive) {
      ws.terminate();
      clients.delete(ws);
    } else {
      ws.isAlive = false;
      ws.ping();
    }
  }
}, 30000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT} (env NODE_ENV=${process.env.NODE_ENV || 'development'})`);
});

// Graceful shutdown
function shutdown() {
  clearInterval(interval);
  console.log('Shutting down server...');
  wss.close(() => server.close(() => process.exit(0)));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
