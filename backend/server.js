import express from 'express';
import { WebSocketServer } from 'ws';
import fs from 'fs';
import http from 'http';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'supersecretadminkey';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// === Directories ===
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
const usernamesPath = path.join(__dirname, 'usernames.json');
const historyPath = path.join(__dirname, 'chatHistory.json');
const filesMetaPath = path.join(__dirname, 'files.json');

// === Persistent Files ===
if (!fs.existsSync(usernamesPath)) fs.writeFileSync(usernamesPath, '{}');
if (!fs.existsSync(historyPath)) fs.writeFileSync(historyPath, '[]');
if (!fs.existsSync(filesMetaPath)) fs.writeFileSync(filesMetaPath, '[]');

// === Load Data ===
let usernames = JSON.parse(fs.readFileSync(usernamesPath));
let chatHistory = JSON.parse(fs.readFileSync(historyPath));
let fileList = JSON.parse(fs.readFileSync(filesMetaPath));

// === Helpers ===
const saveUsernames = () => fs.writeFileSync(usernamesPath, JSON.stringify(usernames, null, 2));
const saveHistory = () => fs.writeFileSync(historyPath, JSON.stringify(chatHistory, null, 2));
const saveFiles = () => fs.writeFileSync(filesMetaPath, JSON.stringify(fileList, null, 2));

// === Upload Middleware ===
const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 1024 * 1024 * 1024 } // 1GB max per file
});
app.use('/uploads', express.static(uploadsDir));

// === Slur Filter ===
const bannedWords = ['nigger', 'faggot', 'retard', 'kike', 'coon'];
const containsSlur = (text) => bannedWords.some(w => text.toLowerCase().includes(w));

// === Connected Clients ===
const clients = new Map(); // ws -> { nick, admin }

// === Broadcast ===
function broadcast(data, except = null) {
  const msg = JSON.stringify(data);
  for (const [ws] of clients) {
    if (ws !== except && ws.readyState === ws.OPEN) ws.send(msg);
  }
}

function sendTo(ws, data) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(data));
}

// === File Utilities ===
function calculateTotalUploadSize() {
  return fs.readdirSync(uploadsDir)
    .map(f => fs.statSync(path.join(uploadsDir, f)).size)
    .reduce((a, b) => a + b, 0);
}

// === WebSocket Handling ===
wss.on('connection', (ws) => {
  clients.set(ws, { nick: 'guest', admin: false });

  // Send chat history and user list
  sendTo(ws, { type: 'history', data: chatHistory });
  sendTo(ws, { type: 'files', data: fileList });
  broadcastUserList();

  ws.on('message', (msg) => {
    try {
      const { type, data } = JSON.parse(msg);

      if (type === 'setNick') {
        const prev = clients.get(ws).nick;
        clients.get(ws).nick = data.trim();
        usernames[ws._socket.remoteAddress] = data.trim();
        saveUsernames();
        sendTo(ws, { type: 'system', text: `Your nickname is now ${data}` });
        broadcastUserList();
        return;
      }

      if (type === 'login') {
        if (data === ADMIN_KEY) {
          clients.get(ws).admin = true;
          sendTo(ws, { type: 'system', text: `You are now logged in as admin.` });
        } else {
          sendTo(ws, { type: 'system', text: `Invalid admin key.` });
        }
        return;
      }

      if (type === 'logout') {
        clients.get(ws).admin = false;
        sendTo(ws, { type: 'system', text: `You have logged out as admin.` });
        return;
      }

      if (type === 'clear') {
        if (!clients.get(ws).admin) {
          sendTo(ws, { type: 'system', text: 'You do not have permission to clear chat.' });
          return;
        }
        chatHistory = [];
        saveHistory();
        broadcast({ type: 'clear' });
        return;
      }

      if (type === 'removefile') {
        if (!clients.get(ws).admin) {
          sendTo(ws, { type: 'system', text: 'Permission denied.' });
          return;
        }
        const fileToDelete = data.trim();
        const fullPath = path.join(uploadsDir, fileToDelete);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
          fileList = fileList.filter(f => f.name !== fileToDelete);
          saveFiles();
          broadcast({ type: 'files', data: fileList });
          broadcast({ type: 'system', text: `${fileToDelete} was removed by admin.` });
        } else {
          sendTo(ws, { type: 'system', text: 'File not found.' });
        }
        return;
      }

      if (type === 'message') {
        const sender = clients.get(ws);
        const text = data.text.trim();

        if (containsSlur(text)) {
          sendTo(ws, { type: 'system', text: 'Message blocked: inappropriate language.' });
          return;
        }

        if (text.startsWith('/msg ')) {
          const [_, targetNick, ...msgParts] = text.split(' ');
          const privateMsg = msgParts.join(' ');
          for (const [client, info] of clients) {
            if (info.nick === targetNick) {
              sendTo(client, { type: 'private', from: sender.nick, text: privateMsg });
              sendTo(ws, { type: 'private', to: targetNick, text: privateMsg });
              return;
            }
          }
          sendTo(ws, { type: 'system', text: `${targetNick} not found.` });
          return;
        }

        // Normal message
        const entry = {
          nick: sender.nick,
          text,
          time: new Date().toISOString()
        };
        chatHistory.push(entry);
        if (chatHistory.length > 500) chatHistory.shift(); // Limit history size
        saveHistory();

        broadcast({ type: 'message', data: entry });
      }
    } catch (e) {
      console.error('Message error:', e);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    broadcastUserList();
  });
});

// === Update User List ===
function broadcastUserList() {
  const list = Array.from(clients.values()).map(u => ({
    nick: u.nick,
    admin: u.admin
  }));
  broadcast({ type: 'users', data: list });
}

// === Upload Endpoint ===
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    const totalSize = calculateTotalUploadSize();
    if (totalSize > 1024 * 1024 * 1024) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Upload limit exceeded (1GB total).' });
    }

    const fileMeta = {
      name: req.file.filename,
      original: req.file.originalname,
      size: req.file.size,
      time: new Date().toISOString(),
      url: `/uploads/${req.file.filename}`
    };
    fileList.push(fileMeta);
    saveFiles();
    broadcast({ type: 'files', data: fileList });
    res.json(fileMeta);
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed.' });
  }
});

// === Serve Frontend ===
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

// === Start Server ===
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
