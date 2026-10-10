"""Masari chat server.

Run from the repo root:
    .venv\\Scripts\\python.exe ai\\chatbot\\server.py
then open http://localhost:8000
"""

import os
import sys
from pathlib import Path

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from google.genai import errors
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rag import Masari  # noqa: E402  (also loads .env)
import stt  # noqa: E402
import students  # noqa: E402
from tools.planner import build_graduation_plan, plan_options  # noqa: E402

app = FastAPI(title="Masari AI Advisor")
# Let the Next.js frontend (another origin) call /api/chat from the browser.
# Comma-separated list, e.g. "http://localhost:3000,https://masari.example.com".
# The live website addresses are always allowed, on top of whatever the variable lists.
LIVE_SITES = ["https://masari-ai-advisor.vercel.app", "https://masari-web-sigma.vercel.app"]
app.add_middleware(
    CORSMiddleware,
    # strip() drops spaces and a stray BOM that some shells add when the value is piped in.
    allow_origins=[
        o.strip().lstrip(chr(0xFEFF))
        for o in os.getenv("MASARI_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
    ]
    + LIVE_SITES,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
bot = Masari()  # builds / loads the search index once at startup


class Message(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    question: str
    history: list[Message] = []
    student_id: str | None = None  # the selected student; without it the student-data tools are not offered


@app.post("/api/chat")
def chat(req: ChatRequest):
    if not req.question.strip():
        raise HTTPException(400, "Empty question")
    if req.student_id and not students.get_student(req.student_id):
        raise HTTPException(404, "Student not found")
    try:
        return bot.answer(req.question.strip(), [m.model_dump() for m in req.history], req.student_id)
    except errors.APIError as e:
        raise HTTPException(502, f"Gemini error {e.code}: {e.message}")


class PlanRequest(BaseModel):
    student_id: str
    target_years: float = 5  # 4, 4.5 or 5
    allow_summer: bool = True
    # What-if: current-term courses the student fails, and the term GPA they expect.
    failed_courses: list[str] = []
    expected_term_gpa: float | None = None


@app.post("/api/plan")
def plan(req: PlanRequest):
    """Graduation plan for the plan page: the plan, the plan without the what-if (to compare), and which
    targets are reachable with / without summer."""
    result = build_graduation_plan(req.student_id, req.target_years, req.allow_summer,
                                   req.failed_courses, req.expected_term_gpa)
    if not result.get("found"):
        raise HTTPException(404 if "الطالب" in result.get("error", "") else 400, result.get("error"))
    what_if = bool(req.failed_courses) or req.expected_term_gpa is not None
    return {
        "plan": result,
        "baseline": build_graduation_plan(req.student_id, req.target_years, req.allow_summer) if what_if else None,
        "options": plan_options(req.student_id, req.failed_courses, req.expected_term_gpa)["options"],
    }


MAX_AUDIO_BYTES =10 * 1024 * 1024  # ~10 minutes of compressed speech


@app.post("/api/transcribe")
async def transcribe(audio: UploadFile = File(...), language: str | None = Form(None)):
    """Speech-to-text for the chat microphone (Whisper). Returns {"text": "..."}."""
    data = await audio.read()
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(413, "Recording is too long")
    try:
        return {"text": stt.transcribe(data, audio.filename or "audio.webm", language or None)}
    except stt.STTError as e:
        raise HTTPException(502, str(e))


@app.get("/api/students")
def list_students():
    """Mock students for the frontend's "choose a student" screen (one card per student)."""
    return {"students": students.list_students()}


@app.get("/api/students/{student_id}")
def get_student(student_id: str):
    """Full record of one student: personal, contact, guardian, qualification, academic status, all terms."""
    s = students.get_student(student_id)
    if not s:
        raise HTTPException(404, "Student not found")
    return s


@app.get("/")
def index():
    return FileResponse(Path(__file__).resolve().parent / "static" / "index.html")


if __name__ == "__main__":
    # Hosting platforms pass the port in $PORT and need 0.0.0.0; locally the defaults are fine.
    uvicorn.run(app, host=os.getenv("HOST", "127.0.0.1"), port=int(os.getenv("PORT", "8000")))
