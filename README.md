# Masari · مساري: AI Academic Advisor

[![CI](https://github.com/kareemibrahim19/masari-ai-advisor/actions/workflows/ci.yml/badge.svg)](https://github.com/kareemibrahim19/masari-ai-advisor/actions/workflows/ci.yml)

Masari is an AI Engineering graduation project: a personalized, explainable academic advisor. It explains university regulations, checks eligibility with a deterministic rules engine, recommends courses and instructors, and plans the path to graduation. The rules decide; the language model only explains.

**Live demo:** https://masari-ai-advisor.vercel.app

This repository contains the **website** and the **AI service** (a RAG chatbot over the program regulations) that powers its chat.

| Folder | What it is |
|---|---|
| [`frontend/`](frontend/) | Next.js 16 + Tailwind v4 + shadcn/ui (Base UI) app. Arabic RTL by default, with English, light and dark themes. See [`frontend/README.md`](frontend/README.md). |
| [`prototype/masari-prototype.html`](prototype/masari-prototype.html) | A single-file, offline-viewable version of the same UI. Open it in any browser. |
| [`ai/chatbot/`](ai/chatbot/) | Masari AI service: FastAPI + Gemini RAG chatbot (`/api/chat`) and Whisper speech-to-text for the microphone (`/api/transcribe`). See [`ai/chatbot/README.md`](ai/chatbot/README.md). |
| [`ai/data/`](ai/data/) | AI data: course list (`courses.json`) and chunked regulations for RAG (`regulations_chunks.json`). |
| [`frontend/public/brand/`](frontend/public/brand/) | Brand files: logo SVG/PNG set and the color palette (`masari-colors.css` / `.json`). |

## Project structure

```
masari-ai-advisor/
├── frontend/                 Next.js website
│   ├── src/app/              one folder per screen (page.tsx)
│   ├── src/components/       Masari components + shadcn/ui primitives
│   ├── src/lib/              rules engine, program data, i18n, chat + voice client
│   └── public/brand/         logos and color palette
├── ai/
│   ├── chatbot/              FastAPI RAG service (rag.py, server.py, stt.py)
│   ├── data/                 courses + regulation chunks used by the chatbot
│   ├── app.py                Vercel entrypoint
│   └── requirements.txt
├── prototype/                single-file HTML version of the UI
└── .github/workflows/ci.yml  lint + build on every push and pull request
```

## Run the app

1. **AI service** (needed for the chat): set up Python and the `.env` keys as described in [`ai/chatbot/README.md`](ai/chatbot/README.md), then start it:
   ```bash
   python ai/chatbot/server.py
   ```
   It listens on http://localhost:8000.
2. **Website**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Then open http://localhost:3000.

The website reads the AI service URL from `NEXT_PUBLIC_MASARI_API_URL` (default `http://localhost:8000`). Both parts deploy to Vercel; see [`ai/chatbot/README.md`](ai/chatbot/README.md#deploy-vercel-hobby-free-no-card).

## Screens

- **Dashboard**: the "your path" graduation rail, academic standing, next-term proposal and alerts.
- **Ask Masari**: chat answered by the AI service from the regulations, with cited sources, typed or spoken (microphone → Whisper). Rule-verified results, AI explanations and regulation sources are visually distinct.
- **Recommendations**: ranked courses with live credit-load validation, plus instructor compatibility.
- **Study plan**: a multi-semester plan with what-if scenarios.
- **Course catalog**: every AI Engineering course with prerequisites, plus the program regulations.

## Data

- **Program data is real**: courses, prerequisites, elective pools and regulations of the B.Sc. in AI Engineering (Faculty of Engineering, Mansoura University). It comes from the [AIE Program Guide](https://aieprogramguide.vercel.app/), an unofficial summary of the bylaws, so verify it against the official bylaws.
- **Student, instructors and seat data are simulated.** Nothing is connected to a university system.
- Recommendations, eligibility, the study plan and what-if results are computed by the rules engine in `frontend/src/lib/rules.ts`.

## Checks

Every push and pull request runs [CI](.github/workflows/ci.yml): the frontend is linted and built (`npm run lint`, `npm run build`, which also type-checks), and the AI service's dependencies are installed and its code compiled. Run the same frontend checks locally before pushing:

```bash
cd frontend
npm run lint
npm run build
```
