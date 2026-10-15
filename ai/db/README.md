# Masari database

The tables for the data in `ai/data/*.json` (program, courses, students and their grades, instructors, advisors),
and for what students save (their recent chats), with SQLAlchemy 2.0.

**In use:** the recent chats on the chat page are saved here per student, so they show on any device or browser
(`chats.py`, endpoints in [`ai/chatbot/chat_history.py`](../chatbot/chat_history.py)).
**In use:** when `DATABASE_URL` is set, the AI service reads students (with their grades), advisors, instructors and
who taught whom from here instead of `ai/data` (`source.py`). `courses.json` (program and regulation rules) and
`regulations_chunks.json` stay files: they change together with the planner and chatbot code. `GET /api/health`
says which one the service is using: `"data_source": "database"` or `"files"`.

| File | What it does |
|---|---|
| `models.py` | The tables (diagram at the top of the file) |
| `database.py` | Connection: `DATABASE_URL`, or a local SQLite file when it is not set |
| `seed.py` | Creates the tables and loads `ai/data/*.json` into them |
| `source.py` | What the AI service reads: the database when `DATABASE_URL` is set and it has students, else the JSON files (also when the database cannot be reached) |
| `export.py` | Reads the database back **in the exact shape of the JSON files**, so the code that reads the files can switch to the database without other changes |
| `chats.py` | Saved recent chats: list, save (keeps the newest 20 per student), delete |
| `choices.py` | Saved choices from the recommendations page (courses, sliders, hidden instructors), one row per student; never dropped by `seed.py --reset` |
| `accounts.py` | Student passwords (salted hashes) for signing in; also the command to set them: `accounts.py set <id>`, `accounts.py demo`, `accounts.py list` |

## Run

From the repo root, after installing `ai/requirements.txt` (see [`ai/chatbot/README.md`](../chatbot/README.md#run)):

```bash
.venv\Scripts\python.exe ai\db\seed.py
```

With no `DATABASE_URL` this creates `ai/masari.db` (SQLite, not committed). Open it with any SQLite viewer, e.g.
[DB Browser for SQLite](https://sqlitebrowser.org/). To load again from scratch:

```bash
.venv\Scripts\python.exe ai\db\seed.py --reset
```

### Postgres (Neon or Supabase, free)

1. Create a project on [neon.tech](https://neon.tech) (or [supabase.com](https://supabase.com)) and copy its connection string.
2. Put it in `.env` at the repo root (never commit it):
   ```
   DATABASE_URL=postgresql://user:password@ep-xxx.neon.tech/neondb?sslmode=require
   ```
3. Run `seed.py` as above. The same command creates the tables in Postgres.

The Postgres driver is [pg8000](https://github.com/tlocke/pg8000), written in pure Python. Compiled drivers
(psycopg) are blocked by Windows Smart App Control on some machines, and pg8000 also installs cleanly on Vercel.
On Windows, if `import sqlalchemy` fails with "An Application Control policy has blocked this file", reinstall it
without its compiled speedups:

```powershell
$env:DISABLE_SQLALCHEMY_CEXT = "1"
.venv\Scripts\python.exe -m pip install --force-reinstall --no-deps --no-binary sqlalchemy sqlalchemy
```

## Design notes

- **Grades and "who taught it" are one table.** `course_results` holds every course a student registered, per term,
  with marks and grade. `instructor_id` / `section` on the same row replace `student_instructor_history.json`
  (every row of that file matches a course result). They are empty for the current term, trainings and projects.
- **Course names are not copied into grades.** A course result points at `courses`, and the export adds the name
  and credits back. The six mock students' names and credits match the catalog exactly.
- **Some fields stay JSON documents** where their shape differs per row or is read as a whole:
  `program.rules` (the rules engine reads it as one object), `course_results.marks` (midterm / coursework /
  practical / final / oral ... depend on the course), instructor survey `profile`s, and `courses.extra`
  (aliases, notes, sources).
- **`academic_status` is stored as the portal shows it**, not recalculated, the same as `students.json`.
- **Saved chats survive reloading the data.** `seed.py --reset` drops only the tables it loads from `ai/data`;
  `chats` and `chat_messages` are never dropped. The chat tables are also created by the AI service on first use,
  so a database that was never seeded still saves chats.
- **A chat is stored as the website's messages.** Each row of `chat_messages` keeps one message object as the page
  had it (question, answer with sources and advisor email, or error), so an opened chat looks exactly as it did.
  `chats.student_id` is checked against the students the service reads (database or file). It is not a foreign
  key, so saved chats keep working on a database that was never seeded.
- **Not in the database:** `regulations_chunks.json` (the RAG text, with its embedding cache keyed to the file)
  and the rest of the website's per-browser state (plan target, reminders dismissed).

## Hosted (Vercel)

The hosted AI service has a read-only disk, so it **needs `DATABASE_URL`** (Neon / Supabase) in Vercel → project
→ Settings → Environment Variables to save chats. Without it the chat endpoints answer 503 and the website keeps
chats in each browser only, as before; the chat itself keeps working.

## Check

```bash
.venv\Scripts\python.exe ai\tests\test_db.py
.venv\Scripts\python.exe ai\tests\test_chats.py
```

It loads `ai/data` into an in-memory database and checks that `export.py` gives back every file exactly (values,
types and order), that wrong data is refused (unknown course, the same course twice in a term), and that hosted
Postgres URLs are set up for pg8000 with SSL. CI runs it on every push.
