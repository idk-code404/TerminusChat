const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const bodyParser = require('body-parser');
const cors = require('cors');
const { register, authenticate, verifyToken } = require('./auth');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Simple REST endpoints for demo
app.post('/api/register', async (req,res) => {
  try{ const {username,password} = req.body; await register(username,password); res.json({ok:true}); }
  catch(e){ res.status(400).json({error:e.message}); }
});

app.post('/api/login', async (req,res) => {
  const { username, password } = req.body;
  const token = await authenticate(username,password);
  if(!token) return res.status(401).json({error:'invalid'});
  res.json({ token });
});

// Serve built frontend in production
app.use(express.static('../frontend/dist'));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Simple in-memory clients set and broadcast
const clients = new Set();

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', ()=> ws.isAlive = true);

  ws.on('message', (data)=>{
    try{
      const msg = JSON.parse(data);
      // Validate message format (server-side sanitation)
      if(msg.type === 'message'){
        // Basic length checks
        if(typeof msg.text !== 'string' || msg.text.length > 2000) return;
        const out = { type:'message', nick: msg.nick||'anon', text: msg.text.substring(0,2000), ts: Date.now() };
        // broadcast
        for(const c of clients){ if(c.readyState === WebSocket.OPEN) c.send(JSON.stringify(out)); }
      }
    }catch(e){ /* ignore invalid */ }
  });

  clients.add(ws);
  ws.send(JSON.stringify({ type:'system', text:'Connected to TerminusChat', ts: Date.now() }));
  ws.on('close', ()=> clients.delete(ws));
});

// Ping/pong to detect dead connections
setInterval(()=>{
  for(const ws of clients){ if(!ws.isAlive){ ws.terminate(); clients.delete(ws); } else { ws.isAlive = false; ws.ping(); } }
}, 30000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log('Server listening on', PORT));
