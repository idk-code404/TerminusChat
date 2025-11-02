TerminusChat

TerminusChat is a terminal-style chat application with global chat, private messaging, and admin controls. It supports a retro terminal aesthetic and real-time messaging with persistent usernames.

Features

Global chat with real-time messaging

Private messages (/msg <user> <message>)

Per-user unread PM counters and notifications

Click username to start a private message automatically

Admin system (/login <key> / /logout)

Secure global /clear command for admins only

Persistent nicknames stored in usernames.json

LocalStorage restores nickname on reconnect

User list panel showing online users and admin status

Commands
Command	Description
/help	Show available commands
/nick <name>	Change your nickname
/me <action>	Send an action message
/msg <user> <text>	Send a private message
/login <key>	Log in as admin
/logout	Log out of admin
/clear	Clear chat (admins can clear globally)
Installation

Clone the repository:

git clone https://github.com/yourusername/terminus-chat.git
cd terminus-chat


Install dependencies for the server:

npm install ws


Create an usernames.json file in the root directory:

echo "{}" > usernames.json


(Optional) Set an admin key:

export ADMIN_KEY="your-secret-key"

Running
Start the WebSocket server
node server.js


The server runs on port 3000 by default. You can change the port by setting the PORT environment variable.

Frontend

Use React (Vite or Create React App) to serve the frontend. Make sure TerminalUI.jsx and App.jsx are in place.

npm run dev


Or deploy to Vercel for the frontend and Render for the WebSocket server.

Notes

PM notifications will flash the document title and play a sound (notification.mp3) when receiving private messages.

Usernames persist across reconnects via usernames.json and LocalStorage.

Only authorized admins can clear global chat using /clear.
