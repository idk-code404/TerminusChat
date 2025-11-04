import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import fs from "fs";
import path from "path";
import cors from "cors";
import multer from "multer";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// Create uploads directory
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Serve uploaded files statically
app.use("/uploads", express.static(uploadDir));

// --- Multer setup for file uploads ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeName = Date.now() + "_" + file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, safeName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB max
});

// Paths for persistent data
const usernamesPath = path.join(__dirname, "usernames.json");
const historyPath = path.join(__dirname, "chatHistory.json");

if (!fs.existsSync(usernamesPath)) fs.writeFileSync(usernamesPath, "{}");
if (!fs.existsSync(historyPath)) fs.writeFileSync(historyPath, "[]");

let usernames = JSON.parse(fs.readFileSync(usernamesPath));
let chatHistory = JSON.parse(fs.readFileSync(historyPath));

// --- MODERATION CONFIG ---
const bannedWords = [
  "nigger", "faggot", "retard", "chink", "spic", "kike",
  "coon", "slut", "whore"
];

function sanitizeMessage(text) {
  let cleaned = text;
  for (const bad of bannedWords) {
    const regex = new RegExp(`\\b${bad}\\b`, "gi");
    if (regex.test(cleaned)) {
      cleaned = cleaned.replace(regex, "****");
    }
  }
  return cleaned;
}

function saveUsernames() {
  fs.writeFileSync(usernamesPath, JSON.stringify(usernames, null, 2));
}
function saveHistory() {
  fs.writeFileSync(historyPath, JSON.stringify(chatHistory.slice(-200), null, 2));
}
function broadcast(data, exclude = null) {
  for (const client of wss.clients) {
    if (client.readyState === 1 && client !== exclude) {
      client.send(JSON.stringify(data));
    }
  }
}

// --- File Upload Endpoint ---
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const fileUrl = `/uploads/${req.file.filename}`;
  const chatEntry = {
    type: "file",
    nick: req.body.nick || "Unknown",
    fileName: req.file.originalname,
    fileUrl,
    time: Date.now()
  };
  chatHistory.push(chatEntry);
  saveHistory();
  broadcast(chatEntry);
  res.json({ success: true, fileUrl });
});

// --- WebSocket Handling ---
wss.on("connection", (ws) => {
  ws.id = Math.random().toString(36).slice(2);
  ws.nick = usernames[ws.id] || `Guest${Math.floor(Math.random() * 1000)}`;
  ws.isAdmin = false;

  ws.send(JSON.stringify({ type: "history", history: chatHistory }));
  ws.send(JSON.stringify({ type: "system", message: "Welcome to TerminusChat." }));
  sendUserList();

  ws.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    if (data.type === "chat") {
      let msg = sanitizeMessage(data.message.trim());
      if (!msg) return;

      if (msg.startsWith("/")) {
        handleCommand(msg, ws);
        return;
      }

      const chatEntry = {
        nick: ws.nick,
        message: msg,
        time: Date.now(),
      };
      chatHistory.push(chatEntry);
      saveHistory();
      broadcast({ type: "chat", ...chatEntry });
    } else if (data.type === "setNick") {
      const newNick = sanitizeMessage(data.nick.trim());
      if (!newNick) return;
      ws.nick = newNick;
      usernames[ws.id] = newNick;
      saveUsernames();
      ws.send(JSON.stringify({ type: "system", message: `Your nickname is now ${newNick}.` }));
      sendUserList();
    }
  });

  ws.on("close", () => {
    delete usernames[ws.id];
    saveUsernames();
    sendUserList();
  });
});

function handleCommand(cmd, ws) {
  const [command, ...args] = cmd.slice(1).split(" ");
  switch (command.toLowerCase()) {
    case "help":
      ws.send(JSON.stringify({
        type: "system",
        message: "Commands: /help, /msg <user> <message>, /login <key>, /logout, /clear"
      }));
      break;
    case "clear":
      if (!ws.isAdmin) {
        ws.send(JSON.stringify({ type: "system", message: "You are not authorized." }));
        return;
      }
      chatHistory = [];
      saveHistory();
      broadcast({ type: "system", message: "[Admin] Chat cleared by admin." });
      break;
    case "login":
      if (args[0] === process.env.ADMIN_KEY) {
        ws.isAdmin = true;
        ws.send(JSON.stringify({ type: "system", message: "Admin access granted." }));
      } else {
        ws.send(JSON.stringify({ type: "system", message: "Invalid admin key." }));
      }
      break;
    case "logout":
      ws.isAdmin = false;
      ws.send(JSON.stringify({ type: "system", message: "Admin access revoked." }));
      break;
    default:
      ws.send(JSON.stringify({ type: "system", message: "Unknown command." }));
  }
}

function sendUserList() {
  const users = Array.from(wss.clients)
    .filter(c => c.readyState === 1)
    .map(c => ({ nick: c.nick, admin: c.isAdmin }));
  broadcast({ type: "userList", users });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ TerminusChat server running on ${PORT}`));
