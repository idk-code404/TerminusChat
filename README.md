## Prepare for GitHub

This repository is prepared to be pushed to GitHub. To create a remote repository and push the code, run:

```bash
# initialize git and push (run from project root)
git init
git add .
git commit -m "Initial commit — TerminusChat"
# create repo on GitHub (use gh CLI) or create manually on GitHub website
# using GitHub CLI (optional):
#   gh repo create your-username/terminuschat --public --source=. --remote=origin --push
# or add a remote manually and push:
git remote add origin git@github.com:YOUR_USERNAME/terminuschat.git
git branch -M main
git push -u origin main
```

The project includes a GitHub Actions workflow at `.github/workflows/ci.yml` that installs dependencies and builds the frontend on push/pull requests to `main` or `master`.

---
# TerminusChat

A terminal-style realtime chat app (React + Tailwind + Node.js WebSocket).

## Local dev (requires Node.js >=16)

1. Install root deps and run both apps:

   npm install
   npm run dev

This runs the backend on http://localhost:3000 and frontend on http://localhost:5173.

## Production

Build frontend, serve static files from backend, run behind an HTTPS reverse proxy (Nginx / CloudLoadBalancer).

## Security
- Use HTTPS/WSS in production.
- Replace in-memory stores with a real DB and Redis for pub/sub.
- Implement proper input validation & sanitization server-side.
- Use environment variables for secrets and JWT keys.
- Add rate limiting and file scanning for uploads.


## Docker Compose (production-like)

A docker-compose is included. To build and run:

```
docker compose build
sudo docker compose up
```

- Frontend: http://localhost:8080
- Backend API / WS: http://localhost:3000 and ws://localhost:3000

Note: In production, put a reverse proxy (Nginx) in front for TLS, configure JWT_SECRET and other secrets via environment variables, and use a proper database and redis for pub/sub.
