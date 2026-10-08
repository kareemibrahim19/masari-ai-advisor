# Masari AI service (RAG chatbot)

Answers questions about the AIE regulations and courses. It reads `ai/data/courses.json` and
`ai/data/regulations_chunks.json`, finds the relevant chunks (BM25 keyword search + Gemini embeddings,
merged with reciprocal-rank fusion) and asks Gemini to answer from them only, citing article numbers.

| File | What it does |
|---|---|
| `rag.py` | Chunking, embeddings (cached in `embeddings/`, committed), hybrid search, query rewriting, Gemini call with model fallback |
| `server.py` | FastAPI server: `POST /api/chat` for the frontend, plus a simple test page at `/` |
| `build_standalone.py` + `standalone_template.html` | Builds `dist/masari-chat.html`, a single-file demo that calls Gemini from the browser with the user's own key |

## Run

1. Python 3.11+. From the repo root:
   ```bash
   python -m venv .venv
   .venv\Scripts\python.exe -m pip install -r ai/requirements.txt
   ```
2. Create `.env` in the repo root (never commit it) with your own key from https://aistudio.google.com/apikey:
   ```
   GEMINI_API_KEY=your-key-here
   ```
3. Start the service (the first start embeds the data, about a minute on the free tier):
   ```bash
   .venv\Scripts\python.exe ai\chatbot\server.py
   ```
   It listens on http://localhost:8000.
4. Start the frontend (`cd frontend`, `npm install`, `npm run dev`) and open http://localhost:3000/chat.

## Deploy (Vercel Hobby, free, no card)

Two Vercel projects, deployed with the Vercel CLI (`npx vercel login` once).

**AI service** — project root `ai/`. Vercel finds the FastAPI `app` in `ai/app.py` and installs `ai/requirements.txt`.

```bash
cd ai
npx vercel deploy --prod
```

Environment variables (Vercel → project → Settings → Environment Variables):
`GEMINI_API_KEY` (secret) and `MASARI_CORS_ORIGINS` = the website URL.

The embedding cache in `ai/chatbot/embeddings/` is committed so the service starts without re-embedding
(the hosted disk is read-only). When `ai/data` changes, run the service locally once and commit the new cache file.

**Website** — project root `frontend/` (Next.js is detected automatically).

```bash
cd frontend
npx vercel deploy --prod
```

Environment variable: `NEXT_PUBLIC_MASARI_API_URL` = the AI service URL (it is baked in at build time, so redeploy after changing it).

`STATIC_EXPORT=1` in `next.config.ts` builds a plain static site instead (`out/`) for hosts that only serve files.

## API

`POST /api/chat`

```json
{ "question": "اقدر اسجل كام ساعة لو معدلي 2.5؟", "history": [{ "role": "user", "content": "..." }, { "role": "assistant", "content": "..." }] }
```

Response:

```json
{ "answer": "...markdown...", "model": "gemini-3.5-flash", "search_query": "...", "sources": [{ "id": "aie-reg-13-ar", "title": "مادة [13]: ...", "source": "regulation" }] }
```

## Settings (`.env`)

| Variable | Default |
|---|---|
| `GEMINI_MODEL` | `gemini-3.8-flash` (falls back to `gemini-3.5-flash`, `gemini-flash-latest`, `gemini-3.5-flash-lite` on 429/503/timeout) |
| `GEMINI_REWRITE_MODEL` | `gemini-3.5-flash-lite` |
| `GEMINI_EMBED_MODEL` | `gemini-embedding-001` |
| `MASARI_CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` (comma-separated origins allowed to call the API) |

The frontend reads the service URL from `NEXT_PUBLIC_MASARI_API_URL` (default `http://localhost:8000`).
