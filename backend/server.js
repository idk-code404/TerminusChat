import express from "express";
import { WebSocketServer } from "ws";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Serve frontend (for Render)
app.use(express.static(path.join(__dirname, "dist")));

const server = app.listen(PORT, () =>
  console.log(`✅ Server running on port ${PORT}`)
);

// WebSocket setup
const wss = new WebSocketServer({ server });
const clients = new Map();
const HISTORY_PATH = path.join(__dirname, "chatHistory.json");

function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"));
  } catch {
    return [];
  }
}

function saveHistory(history) {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history.slice(-200), null, 2));
}

let chatHistory = loadHistory();

wss.on("connection", (ws) => {
  const clientId = Math.random().toString(36).slice(2, 9);
  clients.set(ws, { nick: "guest_" + clientId });

  console.log(`🟢 New connection: ${clientId}`);

  // Send history to this client
  ws.send(JSON.stringify({ type: "history", data: chatHistory }));

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data);

      if (msg.type === "message") {
        const sender = clients.get(ws)?.nick || "anon";
        const out = {
          type: "message",
          nick: sender,
          text: msg.text.substring(0, 1000),
          ts: Date.now(),
        };
        chatHistory.push(out);
        saveHistory(chatHistory);

        for (const [client] of clients)
          if (client.readyState === 1) client.send(JSON.stringify(out));
      }

      else if (msg.type === "nick") {
        const oldNick = clients.get(ws)?.nick || "guest";
        clients.set(ws, { nick: msg.newNick });
        const notice = {
          type: "system",
          text: `${oldNick} is now known as ${msg.newNick}`,
          ts: Date.now(),
        };
        chatHistory.push(notice);
        saveHistory(chatHistory);

        for (const [client] of clients)
          if (client.readyState === 1) client.send(JSON.stringify(notice));
      }

      else if (msg.type === "clear") {
        chatHistory = [];
        saveHistory(chatHistory);

        const notice = {
          type: "system",
          text: "Chat history cleared by user",
          ts: Date.now(),
        };
        for (const [client] of clients)
          if (client.readyState === 1)
            client.send(JSON.stringify({ type: "clear" }));
        console.log("🧹 Chat cleared");
      }

    } catch (e) {
      console.error("invalid message", e);
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`🔴 Client disconnected`);
  });
});
