// TerminusChat server with admin auth, nickname persistence, and chat saving
// Run with: node server.js

const fs = require("fs");
const path = require("path");
const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "supersecret123"; // change this in production

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const usernamesFile = path.join(__dirname, "usernames.json");
let usernames = {};
let chatHistory = [];

// Load usernames if exists
if (fs.existsSync(usernamesFile)) {
  try {
    usernames = JSON.parse(fs.readFileSync(usernamesFile, "utf8"));
  } catch (e) {
    console.error("Error reading usernames.json:", e);
  }
}

function saveUsernames() {
  fs.writeFileSync(usernamesFile, JSON.stringify(usernames, null, 2));
}

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  }
}

// When a new user connects
wss.on("connection", (ws) => {
  ws.isAdmin = false;
  ws.nick = "guest";

  // Send existing chat history to new client
  ws.send(JSON.stringify({ type: "system", text: "Welcome to TerminusChat!" }));
  ws.send(JSON.stringify({ type: "history", history: chatHistory }));

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data);

      // Handle nickname changes
      if (msg.type === "nick") {
        const oldNick = ws.nick || "guest";
        ws.nick = msg.newNick.substring(0, 24) || "guest";
        usernames[ws.nick] = { lastSeen: Date.now() };
        saveUsernames();
        broadcast({
          type: "system",
          text: `${oldNick} is now known as ${ws.nick}`,
          ts: Date.now(),
        });
      }

      // Handle admin login
      else if (msg.type === "login") {
        if (msg.key === ADMIN_KEY) {
          ws.isAdmin = true;
          ws.send(JSON.stringify({ type: "admin-status", value: true }));
          ws.send(
            JSON.stringify({ type: "system", text: "Admin privileges granted." })
          );
        } else {
          ws.send(
            JSON.stringify({ type: "system", text: "Invalid admin key." })
          );
        }
      }

      // Handle logout
      else if (msg.type === "logout") {
        ws.isAdmin = false;
        ws.send(JSON.stringify({ type: "admin-status", value: false }));
        ws.send(
          JSON.stringify({ type: "system", text: "Logged out of admin mode." })
        );
      }

      // Handle chat messages
      else if (msg.type === "message") {
        const payload = {
          type: "message",
          nick: ws.nick || "guest",
          text: msg.text.substring(0, 2000),
          ts: Date.now(),
        };
        chatHistory.push(payload);
        if (chatHistory.length > 100) chatHistory.shift(); // limit history
        broadcast(payload);
      }

      // Handle global clear (admin only)
      else if (msg.type === "clear") {
        if (ws.isAdmin) {
          chatHistory = [];
          broadcast({
            type: "system",
            text: "[ADMIN] Global chat cleared.",
            ts: Date.now(),
          });
          broadcast({ type: "clear" });
        } else {
          ws.send(
            JSON.stringify({
              type: "system",
              text: "You are not authorized to clear chat globally.",
            })
          );
        }
      }
    } catch (e) {
      console.error("Error handling message:", e);
    }
  });

  ws.on("close", () => {
    if (ws.nick && usernames[ws.nick]) {
      usernames[ws.nick].lastSeen = Date.now();
      saveUsernames();
    }
  });
});

server.listen(PORT, () =>
  console.log(`🚀 TerminusChat server running on :${PORT}`)
);
