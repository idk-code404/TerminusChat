import express from "express";
import { WebSocketServer } from "ws";
import fs from "fs";
import path from "path";
import http from "http";
import multer from "multer";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "usernames.json");
const HISTORY_FILE = path.join(DATA_DIR, "chat_history.json");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const ADMIN_KEY = "supersecretadminkey";

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "{}");
if (!fs.existsSync(HISTORY_FILE)) fs.writeFileSync(HISTORY_FILE, "[]");

// Load user data
let usernames = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
let chatHistory = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));

// Multer for file uploads (limit 1 GB)
const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1 GB
});

app.use(express.static("public"));
app.use("/uploads", express.static(UPLOAD_DIR));

// File upload endpoint
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded." });
  const fileUrl = `/uploads/${req.file.filename}`;
  const fileInfo = {
    type: "file",
    user: req.query.user || "guest",
    filename: req.file.originalname,
    url: fileUrl,
    size: req.file.size,
    timestamp: Date.now(),
  };
  chatHistory.push(fileInfo);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(chatHistory, null, 2));
  broadcast(fileInfo);
  res.json({ success: true, file: fileInfo });
});

// Helper functions
const broadcast = (msg) => {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(data);
  }
};

const profanityList = ["nigger", "faggot", "kike", "chink", "spic"];
const sanitizeMessage = (text) => {
  let sanitized = text;
  for (const bad of profanityList) {
    const regex = new RegExp(`\\b${bad}\\b`, "gi");
    sanitized = sanitized.replace(regex, "***");
  }
  return sanitized;
};

const getUserList = () => {
  return [...wss.clients]
    .filter((c) => c.readyState === 1)
    .map((c) => ({
      nick: c.nick || "guest",
      isAdmin: c.isAdmin || false,
    }));
};

// WebSocket handling
wss.on("connection", (ws) => {
  ws.nick = "guest";
  ws.isAdmin = false;

  ws.send(JSON.stringify({ type: "welcome", text: "Welcome to TerminusChat." }));
  ws.send(JSON.stringify({ type: "history", data: chatHistory }));
  ws.send(JSON.stringify({ type: "userlist", data: getUserList() }));

  ws.on("message", (message) => {
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }

    if (msg.type === "setnick") {
      ws.nick = msg.nick;
      usernames[msg.clientId] = msg.nick;
      fs.writeFileSync(USERS_FILE, JSON.stringify(usernames, null, 2));
      ws.send(
        JSON.stringify({ type: "system", text: `Your nickname is now ${ws.nick}.` })
      );
      broadcast({ type: "userlist", data: getUserList() });
      return;
    }

    if (msg.type === "command") {
      const [cmd, ...args] = msg.text.trim().split(" ");
      switch (cmd) {
        case "/login":
          if (args[0] === ADMIN_KEY) {
            ws.isAdmin = true;
            ws.send({ type: "system", text: "You are now logged in as admin." });
          } else {
            ws.send({ type: "system", text: "Invalid admin key." });
          }
          break;
        case "/logout":
          ws.isAdmin = false;
          ws.send({ type: "system", text: "You are now logged out." });
          break;
        case "/clear":
          if (!ws.isAdmin) {
            ws.send({ type: "system", text: "You are not authorized to clear chat." });
            return;
          }
          chatHistory = [];
          fs.writeFileSync(HISTORY_FILE, "[]");
          broadcast({ type: "clearchat" });
          break;
        case "/removefile":
          if (!ws.isAdmin) {
            ws.send({ type: "system", text: "You are not authorized to remove files." });
            return;
          }
          const fileToDelete = args.join(" ");
          const found = chatHistory.find(
            (entry) => entry.type === "file" && entry.filename === fileToDelete
          );
          if (found) {
            try {
              fs.unlinkSync(path.join(__dirname, found.url));
            } catch {}
            chatHistory = chatHistory.filter((entry) => entry !== found);
            fs.writeFileSync(HISTORY_FILE, JSON.stringify(chatHistory, null, 2));
            broadcast({ type: "system", text: `File ${fileToDelete} removed by admin.` });
          } else {
            ws.send({ type: "system", text: "File not found." });
          }
          break;
        default:
          ws.send({ type: "system", text: "Unknown command." });
      }
      return;
    }

    if (msg.type === "chat") {
      const text = sanitizeMessage(msg.text.trim());
      const entry = {
        type: "chat",
        user: ws.nick,
        text,
        timestamp: Date.now(),
      };
      chatHistory.push(entry);
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(chatHistory, null, 2));
      broadcast(entry);
    }
  });

  ws.on("close", () => {
    broadcast({ type: "userlist", data: getUserList() });
  });
});

server.listen(PORT, () => console.log(`Server running on ${PORT}`));
