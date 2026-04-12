# CodeMate (scaffold)

Real-time mentor–student coding rooms with shared editor, voice call, chat, and Judge0 execution. This repo contains a lightweight full-stack scaffold:

- `frontend/`: React + Vite + Monaco editor + Socket.IO client + WebRTC audio call.
- `backend/`: Express + Socket.IO + MongoDB (Mongoose) + JWT auth + Judge0 proxy.

## Quick start

1) Backend
```bash
cd backend
cp .env.example .env
# edit .env with your JWT secret and Judge0 endpoint/key
# optional: set MONGO_URI (defaults to mongodb://127.0.0.1:27017/codemate)
# optional: set CLIENT_ORIGIN (defaults to http://localhost:5173 for CORS)
npm install
# start Mongo locally (if you don't have one running)
# docker run -d --name codemate-mongo -p 27017:27017 mongo:7
npm run dev
```

2) Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
# open http://localhost:5173
```

## Features in this scaffold
- JWT login/register (student or TA) and auth-protected routes/sockets.
- Room create/join via URL `/:roomId`.
- Monaco-based shared code editor with Socket.IO broadcast updates.
- Judge0 run button (Python/C++/Java/JS/TS); results echoed to peers.
- Chat sidebar with presence-style styling.
- 1:1 WebRTC audio call with socket signaling (STUN only; bring your own TURN for prod).
- Manual save to Mongo revisions; recent history endpoint stubbed.
- AI debugging assistant frontend (default `/`) with log paste/upload, optional code, similar-issue recall, LLM analysis, PR draft & confidence badge.

## Important env vars
See `backend/.env.example` and `frontend/.env.example` for all flags. You must set `MONGO_URI` and `JWT_SECRET` on the backend; for Judge0 you can self-host or use RapidAPI keys.

## Next steps
- Add proper CRDT (e.g., Yjs) instead of broadcast overwrites.
- Flesh out TA dashboard and raise-hand queue.
- Add refresh tokens + rate limits + TURN credentials service.
- Persist recent rooms per user and display in dashboard.
