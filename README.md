# AI Debugging Assistant

An AI-first debugging assistant that turns pasted logs or uploaded log files into a structured diagnosis.

What it returns:

- root cause
- suggested fix
- confidence score
- PR-ready summary
- similar past issues

The app is local-first, so the analysis still works if the backend is unavailable. If the backend and an OpenAI key are configured, the app can upgrade the result with LLM output.

----OutPut----

<img width="1401" height="756" alt="image" src="https://github.com/user-attachments/assets/81cf3fe7-e346-4339-9f72-cbba49e30197" />
<img width="1406" height="752" alt="image" src="https://github.com/user-attachments/assets/b8547107-eb63-4aae-9c5d-563e5acfbc74" />
<img width="1401" height="270" alt="image" src="https://github.com/user-attachments/assets/037f55dd-cba9-4cd3-8368-d23b2d8a14e2" />

--------Architecture----------






User Prompt
     ↓
🧠 Brain (LLM)
     ↓ decides
 ┌───────────────┬───────────────┐
 ↓               ↓               ↓
🛠️ Tools       🧠💾 Memory      (Internal reasoning)
 ↓               ↓
Results        Retrieved context
     ↓
🧠 Brain combines everything
     ↓
Final Answer / Code Output







-------------------------------

## Features

- Paste logs or upload `.txt` / `.log` files
- Optionally add a code snippet from the failing path
- Match against a bundled memory of past issues across React, Node, Python, Java, SQL, auth, networking, and file-system bugs
- Show a diagnosis card with confidence and suggested fix
- Surface similar historical incidents and a generic pattern fallback for new bug types
- Optionally enrich the result with the backend `/ai/debug` route

## Tech Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- AI: OpenAI API, optional
- Memory: local JSON issue library

## Project Structure

- `frontend/src/pages/AIDebuggerStandalone.jsx` - main UI
- `frontend/src/utils/debugAnalysis.js` - local scoring and fallback analysis
- `frontend/src/data/pastIssues.js` - bundled issue memory for the frontend
- `backend/src/routes/ai.js` - optional API endpoint for server-side analysis
- `backend/src/services/debugAssistant.js` - backend analyzer and OpenAI integration

## Quick Start

### Frontend only

```bash
cd frontend
npm install
npm run dev
```

Open the URL shown in the terminal, usually `http://localhost:5173`.

### Optional backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

If MongoDB is not available, the backend will still boot for the AI debugger, but the auth and room features will return `503` until `MONGO_URI` is set and reachable.

## Environment Variables

Frontend:

- `VITE_API_URL` - optional backend URL, defaults to `http://localhost:4000`
- `OPENAI_API_KEY` - optional; if set in `frontend/.env`, the Vite dev server will expose GenAI routes at `/ai/debug` and `/ai/agent` (Cursor-style prompts) without needing a separate backend port
- `OPENAI_MODEL` - optional model name for the Vite GenAI middleware, defaults to `gpt-4o-mini`

Backend:

- `MONGO_URI` - MongoDB connection string
- `JWT_SECRET` - JWT signing secret
- `OPENAI_API_KEY` - optional OpenAI key for LLM responses
- `OPENAI_MODEL` - optional model name, defaults to `gpt-4o-mini`

## How It Works

1. The user submits logs and an optional code snippet.
2. The frontend runs a local similarity search against bundled past issues.
3. The UI immediately shows a diagnosis from local recall.
4. If the backend responds, the result is merged with the server-side analysis.

## Editor-Agnostic Autopilot (File Watcher)

If you want autonomous detection in any editor, run the watcher script. It re-analyzes every time your logs file changes.

```bash
node tools/ai-debug-watch.mjs --logs ./logs.txt --snippet ./snippet.js --out-json ./debug-result.json --out-fixed ./fixed-code.txt
```

Notes:

- `--logs` is the file you append build/test/runtime output to.
- `--snippet` can be any file you want to treat as the code context (or omit it).
- The watcher prints a brief diagnosis to the terminal and keeps the latest structured JSON and fixed-code preview updated.

## Prompt Mode (No Files)

If you prefer a prompt-style workflow (paste logs/snippet directly in the terminal), run:

```bash
node tools/ai-debug-prompt.mjs
```

You can also pipe logs:

```bash
cat build.log | node tools/ai-debug-prompt.mjs
```

## Troubleshooting

- If the result looks local-only, the backend is probably offline or `VITE_API_URL` is wrong.
- If you want LLM-powered responses, make sure `OPENAI_API_KEY` is set in `backend/.env`.
- If auth or rooms return `503`, MongoDB is not connected yet.
- If file upload does nothing, verify the file is plain text and the browser can read local files.

## Notes

- The assistant is intentionally demo-friendly and can run without any external AI service.
