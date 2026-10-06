# Masari · مساري: AI Academic Advisor

Masari is an AI Engineering graduation project: a personalized, explainable academic advisor. It explains university regulations, checks eligibility with a deterministic rules engine, recommends courses and instructors, and plans the path to graduation. The rules decide; the language model only explains.

This repository contains the **web frontend prototype**.

| Folder | What it is |
|---|---|
| [`frontend/`](frontend/) | Next.js 16 + Tailwind v4 + shadcn/ui (Base UI) app. Arabic RTL by default, with English, light and dark themes. See [`frontend/README.md`](frontend/README.md). |
| [`prototype/masari-prototype.html`](prototype/masari-prototype.html) | A single-file, offline-viewable version of the same UI. Open it in any browser. |
| [`Masari Project logo brief final/`](Masari%20Project%20logo%20brief%20final/) | Brand source files: logo SVG/PNG set and the color palette (`masari-colors.css` / `.json`). |

## Run the app

```bash
cd frontend
npm install
npm run dev
```

Then open http://localhost:3000.

## Screens

- **Dashboard**: the "your path" graduation rail, academic standing, next-term proposal and alerts.
- **Ask Masari**: chat where rule-verified results, AI explanations and regulation sources are visually distinct.
- **Recommendations**: ranked courses with live credit-load validation, plus instructor compatibility.
- **Study plan**: a multi-semester plan with what-if scenarios.
- **Course catalog**: every AI Engineering course with prerequisites, plus the program regulations.

## Data

- **Program data is real**: courses, prerequisites, elective pools and regulations of the B.Sc. in AI Engineering (Faculty of Engineering, Mansoura University). It comes from the [AIE Program Guide](https://aieprogramguide.vercel.app/), an unofficial summary of the bylaws, so verify it against the official bylaws.
- **Student, instructors and seat data are simulated.** Nothing is connected to a university system.
- Recommendations, eligibility, the study plan and what-if results are computed by the rules engine in `frontend/src/lib/rules.ts`.
