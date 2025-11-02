import express from "express";
import { WebSocketServer } from "ws";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "changeme123"; // set in Render env for safety

// Serve frontend build (for Render)
app.use(express.static(path.join(__dirname, "dist")));

const server = app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

const wss = new WebSocketServer({ server });
const clients = new Map();
const HISTORY_PATH = path.join(__dirname, "chatHistory.json");
const USERS_PATH = path.join(__dirname, "usernames.json");

function loadFile(file, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}
function saveFile(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let chatHistory = loadFile(HISTORY_PATH, []);
let usernames = loadFile(USERS_PATH, {});

function broadcast(obj) {
  const json = JSON.stringify(obj);
  for (const [client] of clients)
    if (client.readyState === 1) client.send(json);
}

wss.on("connection", (ws) => {
  const clientId = Math.random().toString(36).slice(2, 9);
  const savedNick = usernames[clientId] || `guest_${clientId}`;
  clients.set(ws, { id: clientId, nick: savedNick });

  console.log(`🟢 New connection ${clientId} (${savedNick})`);

  // Send chat history + assigned nick
  ws.send(JSON.stringify({ type: "history", data: chatHistory }));
  ws.send(JSON.stringify({ type: "nick-assign", nick: savedNick, id: clientId }));

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw);
      const client = clients.get(ws);

      if (msg.type === "message") {
        const out = {
          type: "message",
          nick: client.nick,
          text: msg.text.substring(0, 1000),
          ts: Date.now(),
        };
        chatHistory.push(out);
        saveFile(HISTORY_PATH, chatHistory.slice(-200));
        broadcast(out);
      }

      else if (msg.type === "nick") {
        const old = client.nick;
        client.nick = msg.newNick.substring(0, 24);
        usernames[client.id] = client.nick;
        saveFile(USERS_PATH, usernames);

        const sys = {
          type: "system",
          text: `${old} is now known as ${client.nick}`,
          ts: Date.now(),
        };
        chatHistory.push(sys);
        saveFile(HISTORY_PATH, chatHistory.slice(-200));
        broadcast(sys);
      }

      else if (msg.type === "clear") {
        if (msg.key && msg.key === ADMIN_KEY) {
          chatHistory = [];
          saveFile(HISTORY_PATH, []);
          broadcast({ type: "clear" });
          broadcast({ type: "system", text: "🧹 Chat cleared by admin.", ts: Date.now() });
          console.log("🧹 Chat cleared by admin");
        } else {
          ws.send(JSON.stringify({ type: "system", text: "Invalid admin key. Local clear only." }));
        }
      }
    } catch (e) {
      console.error("❌ Bad message:", e);
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
  });
});
