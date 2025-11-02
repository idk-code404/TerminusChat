// TerminusChat server (v3)
// Features: persistent usernames, admin auth, /msg private messages, chat history
// Run: node server.js

const fs = require("fs");
const path = require("path");
const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "supersecret123";

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ======= Persistent Usernames =======
const usernamesFile = path.join(__dirname, "usernames.json");
let usernames = {};
if (fs.existsSync(usernamesFile)) {
  try {
    usernames = JSON.parse(fs.readFileSync(usernamesFile, "utf8"));
  } catch {
    usernames = {};
  }
}
function saveUsernames() {
  fs.writeFileSync(usernamesFile, JSON.stringify(usernames, null, 2));
}

// ======= Chat State =======
let chatHistory = [];

// ======= Broadcast Utility =======
function broadcast(obj, except = null) {
  const msg = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client !== except && client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

// ======= Helper =======
function findClientByNick(nick) {
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN && client.nick === nick) {
      return client;
    }
  }
  return null;
}

// ======= WebSocket Connection =======
wss.on("connection", (ws) => {
  ws.isAdmin = false;
  ws.nick = "guest-" + Math.floor(Math.random() * 1000);

  // Restore nickname if known
  const addr = ws._socket.remoteAddress;
  if (usernames[addr]) {
    ws.nick = usernames[addr].nick;
  } else {
    usernames[addr] = { nick: ws.nick, lastSeen: Date.now() };
    saveUsernames();
  }

  // Send chat history & welcome
  ws.send(JSON.stringify({ type: "system", text: `Welcome, ${ws.nick}! Type /help for commands.` }));
  ws.send(JSON.stringify({ type: "history", history: chatHistory }));

  // Notify all
  broadcast({ type: "system", text: `${ws.nick} joined the chat.` }, ws);

  // ===== Message Handler =====
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    // Change nickname
    if (msg.type === "nick") {
      const oldNick = ws.nick;
      ws.nick = msg.newNick.substring(0, 24);
      usernames[addr] = { nick: ws.nick, lastSeen: Date.now() };
      saveUsernames();
      broadcast({
        type: "system",
        text: `${oldNick} is now known as ${ws.nick}`,
      });
    }

    // Login as admin
    else if (msg.type === "login") {
      if (msg.key === ADMIN_KEY) {
        ws.isAdmin = true;
        ws.send(JSON.stringify({ type: "admin-status", value: true }));
        ws.send(JSON.stringify({ type: "system", text: "Admin privileges granted." }));
      } else {
        ws.send(JSON.stringify({ type: "system", text: "Invalid admin key." }));
      }
    }

    // Logout admin
    else if (msg.type === "logout") {
      ws.isAdmin = false;
      ws.send(JSON.stringify({ type: "admin-status", value: false }));
      ws.send(JSON.stringify({ type: "system", text: "Logged out of admin mode." }));
    }

    // Clear chat (admin only)
    else if (msg.type === "clear") {
      if (ws.isAdmin) {
        chatHistory = [];
        broadcast({ type: "system", text: "[ADMIN] Global chat cleared." });
        broadcast({ type: "clear" });
      } else {
        ws.send(JSON.stringify({ type: "system", text: "You are not authorized to clear chat." }));
      }
    }

    // Private message
    else if (msg.type === "private") {
      const target = findClientByNick(msg.to);
      if (!target) {
        ws.send(JSON.stringify({ type: "system", text: `User "${msg.to}" not found.` }));
        return;
      }
      const payload = {
        type: "private",
        from: ws.nick,
        to: msg.to,
        text: msg.text.substring(0, 1000),
      };
      target.send(JSON.stringify(payload));
      ws.send(JSON.stringify(payload)); // echo back to sender
    }

    // Normal public message
    else if (msg.type === "message") {
      const payload = {
        type: "message",
        nick: ws.nick,
        text: msg.text.substring(0, 2000),
        ts: Date.now(),
      };
      chatHistory.push(payload);
      if (chatHistory.length > 100) chatHistory.shift();
      broadcast(payload);
    }
  });

  // ===== Disconnection =====
  ws.on("close", () => {
    usernames[addr] = { nick: ws.nick, lastSeen: Date.now() };
    saveUsernames();
    broadcast({ type: "system", text: `${ws.nick} left the chat.` });
  });
});

server.listen(PORT, () => console.log(`🚀 TerminusChat running on :${PORT}`));
