import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, "dist")));
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Persistent usernames
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

// Bug reports
const bugReportFile = path.join(__dirname, "bugreports.json");
let bugReports = [];
if (fs.existsSync(bugReportFile)) {
  try {
    bugReports = JSON.parse(fs.readFileSync(bugReportFile, "utf8"));
  } catch {
    bugReports = [];
  }
}
function saveBugs() {
  fs.writeFileSync(bugReportFile, JSON.stringify(bugReports, null, 2));
}

const clients = new Map();
const ADMIN_KEY = process.env.ADMIN_KEY || "supersecretkey";

function broadcast(data, exclude = null) {
  for (const [_, ws] of clients.entries()) {
    if (ws !== exclude && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }
}

wss.on("connection", (ws, req) => {
  const ip = req.socket.remoteAddress;
  ws.nick = usernames[ip]?.nick || "guest";
  ws.isAdmin = false;
  clients.set(ws, ws);

  // Send existing users list
  ws.send(JSON.stringify({ type: "userlist", users: getUserList() }));

  // Broadcast join
  broadcast({ type: "join", nick: ws.nick });

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());

      // Change nickname
      if (data.type === "nick" && data.newNick) {
        ws.nick = data.newNick.trim() || "guest";
        usernames[ip] = { nick: ws.nick, lastSeen: Date.now() };
        saveUsernames();
        ws.send(JSON.stringify({ type: "system", msg: `[system] Your nickname is now ${ws.nick}` }));
        broadcast({ type: "userlist", users: getUserList() });
      }

      // Normal message
      else if (data.type === "chat") {
        broadcast({ type: "chat", nick: ws.nick, msg: data.msg });
      }

      // Private message
      else if (data.type === "pm") {
        const target = [...clients.values()].find(u => u.nick === data.to);
        if (target) {
          target.send(JSON.stringify({ type: "pm", from: ws.nick, msg: data.msg }));
          ws.send(JSON.stringify({ type: "system", msg: `[system] PM sent to ${data.to}` }));
        } else {
          ws.send(JSON.stringify({ type: "system", msg: `[system] User ${data.to} not found.` }));
        }
      }

      // Admin login/logout
      else if (data.type === "login") {
        if (data.key === ADMIN_KEY) {
          ws.isAdmin = true;
          ws.send(JSON.stringify({ type: "system", msg: "[system] Admin mode activated." }));
        } else {
          ws.send(JSON.stringify({ type: "system", msg: "[system] Invalid key." }));
        }
      } else if (data.type === "logout") {
        ws.isAdmin = false;
        ws.send(JSON.stringify({ type: "system", msg: "[system] Logged out of admin mode." }));
      }

      // Clear chat
      else if (data.type === "clear") {
        if (ws.isAdmin) {
          broadcast({ type: "clear" });
          ws.send(JSON.stringify({ type: "system", msg: "[system] Chat cleared globally." }));
        } else {
          ws.send(JSON.stringify({ type: "system", msg: "[system] You must be admin to use /clear." }));
        }
      }

      // Bug report
      else if (data.type === "bug" && data.report) {
        const report = {
          nick: ws.nick || "unknown",
          time: new Date().toISOString(),
          report: data.report.trim()
        };
        bugReports.push(report);
        saveBugs();
        ws.send(JSON.stringify({ type: "system", msg: "[system] Bug report sent successfully!" }));
      }

    } catch (err) {
      console.error("Message error:", err);
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    broadcast({ type: "userlist", users: getUserList() });
  });
});

function getUserList() {
  return [...clients.values()].map(ws => ({
    nick: ws.nick,
    admin: ws.isAdmin,
  }));
}

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
