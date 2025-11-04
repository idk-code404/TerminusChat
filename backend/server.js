import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import fs from "fs";
import path from "path";
import cors from "cors";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// Paths
const usernamesPath = path.join(__dirname, "usernames.json");
const historyPath = path.join(__dirname, "chatHistory.json");

// Ensure files exist
if (!fs.existsSync(usernamesPath)) fs.writeFileSync(usernamesPath, "{}");
if (!fs.existsSync(historyPath)) fs.writeFileSync(historyPath, "[]");

// Load persistent data
let usernames = JSON.parse(fs.readFileSync(usernamesPath));
let chatHistory = JSON.parse(fs.readFileSync(historyPath));

// --- MODERATION CONFIG ---
const bannedWords = [
  "nigger", "faggot", "retard", "chink", "spic", "kike", // etc. (add responsibly)
  "coon", "slut", "whore"
];

// Basic sanitizer (you can replace with a regex or external library)
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

// Helper: save files safely
function saveUsernames() {
  fs.writeFileSync(usernamesPath, JSON.stringify(usernames, null, 2));
}
function saveHistory() {
  fs.writeFileSync(historyPath, JSON.stringify(chatHistory.slice(-200), null, 2));
}

// Helper: broadcast message
function broadcast(data, exclude = null) {
  for (const client of wss.clients) {
    if (client.readyState === 1 && client !== exclude) {
      client.send(JSON.stringify(data));
    }
  }
}

// --- MAIN WEBSOCKET HANDLING ---
wss.on("connection", (ws) => {
  ws.id = Math.random().toString(36).slice(2);
  ws.nick = usernames[ws.id] || `Guest${Math.floor(Math.random() * 1000)}`;
  ws.isAdmin = false;

  // Send history and user list
  ws.send(JSON.stringify({ type: "history", history: chatHistory }));
  sendUserList();

  ws.send(JSON.stringify({ type: "system", message: "Welcome to TerminusChat." }));

  ws.on("message", (msgData) => {
    let data;
    try {
      data = JSON.parse(msgData);
    } catch {
      return;
    }

    if (data.type === "chat") {
      let msg = sanitizeMessage(data.message.trim());
      if (!msg) return;

      // handle commands
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

// --- COMMAND HANDLER ---
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

// --- ONLINE USERS LIST ---
function sendUserList() {
  const users = Array.from(wss.clients)
    .filter(c => c.readyState === 1)
    .map(c => ({ nick: c.nick, admin: c.isAdmin }));
  broadcast({ type: "userList", users });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ TerminusChat server running on ${PORT}`));
