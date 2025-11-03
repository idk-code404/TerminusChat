// server.js
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());
app.use(express.static("public")); // serve frontend or shared files

// --- Persistent usernames ---
const usernamesFile = path.join(__dirname, "usernames.json");
let usernames = {};

if (fs.existsSync(usernamesFile)) {
  usernames = JSON.parse(fs.readFileSync(usernamesFile));
}

// Save usernames persistently
function saveUsernames() {
  fs.writeFileSync(usernamesFile, JSON.stringify(usernames, null, 2));
}

// --- Admin Configuration ---
const ADMIN_KEY = process.env.ADMIN_KEY || "supersecretkey";

// --- Connected Users ---
let clients = new Map(); // ws -> { name, isAdmin }

// --- Utility Broadcasts ---
function broadcast(data, exclude) {
  const msg = JSON.stringify(data);
  for (const [ws] of clients) {
    if (ws !== exclude && ws.readyState === ws.OPEN) ws.send(msg);
  }
}

function sendUserList() {
  const userList = Array.from(clients.values()).map((u) => ({
    name: u.name,
    isAdmin: u.isAdmin,
  }));
  broadcast({ type: "userlist", users: userList });
}

// --- WebSocket Connection Handling ---
wss.on("connection", (ws) => {
  const id = Math.random().toString(36).substr(2, 6);
  let user = usernames[id] || { name: "guest_" + id, isAdmin: false };
  clients.set(ws, user);

  console.log(`[+] ${user.name} connected`);
  sendUserList();

  // Send a welcome message to the user
  ws.send(
    JSON.stringify({
      type: "system",
      text: `Welcome, ${user.name}! Type /help for available commands.`,
      selfOnly: true,
    })
  );

  // Broadcast join
  broadcast(
    { type: "system", text: `${user.name} joined the chat.` },
    ws
  );

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data);
      const sender = clients.get(ws);

      // --- Handle text messages ---
      if (msg.type === "message") {
        broadcast({ type: "message", from: sender.name, text: msg.text });
      }

      // --- Handle private messages ---
      else if (msg.type === "private") {
        const targetName = msg.to;
        const target = Array.from(clients.entries()).find(
          ([, u]) => u.name === targetName
        );

        if (target) {
          const [targetWs] = target;
          if (targetWs.readyState === targetWs.OPEN) {
            targetWs.send(
              JSON.stringify({
                type: "private",
                from: sender.name,
                text: msg.text,
              })
            );
            ws.send(
              JSON.stringify({
                type: "system",
                text: `(Private to ${targetName}): ${msg.text}`,
                selfOnly: true,
              })
            );
          }
        } else {
          ws.send(
            JSON.stringify({
              type: "system",
              text: `${targetName} not found.`,
              selfOnly: true,
            })
          );
        }
      }

      // --- Handle nickname changes ---
      else if (msg.type === "nick") {
        const oldName = sender.name;
        sender.name = msg.newNick || oldName;
        usernames[id] = sender;
        saveUsernames();
        ws.send(
          JSON.stringify({
            type: "system",
            text: `Your nickname is now ${sender.name}`,
            selfOnly: true,
          })
        );
        broadcast(
          { type: "system", text: `${oldName} is now known as ${sender.name}` },
          ws
        );
        sendUserList();
      }

      // --- Handle file sharing ---
      else if (msg.type === "file") {
        // If your files are small, we can broadcast them base64 inline
        const fileMsg = {
          type: "file",
          from: sender.name,
          filename: msg.filename,
          data: msg.data, // base64 string
        };
        broadcast(fileMsg);
      }

      // --- Handle admin commands ---
      else if (msg.type === "command") {
        if (msg.command === "login") {
          if (msg.key === ADMIN_KEY) {
            sender.isAdmin = true;
            ws.send(
              JSON.stringify({
                type: "system",
                text: `Admin login successful.`,
                selfOnly: true,
              })
            );
            sendUserList();
          } else {
            ws.send(
              JSON.stringify({
                type: "system",
                text: `Invalid admin key.`,
                selfOnly: true,
              })
            );
          }
        } else if (msg.command === "logout") {
          sender.isAdmin = false;
          ws.send(
            JSON.stringify({
              type: "system",
              text: `Admin mode disabled.`,
              selfOnly: true,
            })
          );
          sendUserList();
        } else if (msg.command === "clear") {
          if (sender.isAdmin) {
            broadcast({ type: "clear" });
          } else {
            ws.send(
              JSON.stringify({
                type: "system",
                text: `You do not have permission to clear chat.`,
                selfOnly: true,
              })
            );
          }
        }
      }
    } catch (e) {
      console.error("Error handling message:", e);
    }
  });

  ws.on("close", () => {
    const user = clients.get(ws);
    if (user) {
      console.log(`[-] ${user.name} disconnected`);
      broadcast({ type: "system", text: `${user.name} left the chat.` });
      clients.delete(ws);
      sendUserList();
    }
  });
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
