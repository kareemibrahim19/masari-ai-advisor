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
from tools import call_tool, tool_names  # noqa: E402
from tools import instructors as instructor_tools  # noqa: E402

app = FastAPI(title="Masari AI Advisor")
# Let the Next.js frontend (another origin) call the API from the browser. The known site domains are always
# allowed, so a new deployment works without touching the host settings; MASARI_CORS_ORIGINS (comma-separated)
# adds more, e.g. "https://masari.example.com".
KNOWN_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://masari-ai-advisor.vercel.app",
    "https://masari-web-sigma.vercel.app",
]
# strip() drops spaces and a stray BOM that some shells add when the value is piped in.
EXTRA_ORIGINS = [o.strip().lstrip(chr(0xFEFF)) for o in os.getenv("MASARI_CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(dict.fromkeys(KNOWN_ORIGINS + EXTRA_ORIGINS)),
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


MAX_AUDIO_BYTES = 10 * 1024 * 1024  # ~10 minutes of compressed speech


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


@app.get("/api/instructors/courses")
def instructor_courses():
    """Courses that have instructor survey data (for the recommendations page's course picker)."""
    return instructor_tools.courses_with_instructors()


@app.get("/api/instructors/recommend")
def recommend_instructors(course_code: str, student_id: str, pace: float | None = None,
                          workload: float | None = None, practical: float | None = None):
    """Instructors of a course ranked for one student, with the basis and reasons (same result the chat tool gives).

    pace / workload / practical (0-100) are the student's stated preferences; leave them out to rank by the
    student's own history (or by the surveys alone for a first-year student).
    """
    if not students.get_student(student_id):
        raise HTTPException(404, "Student not found")
    result = instructor_tools.recommend_instructor(student_id, course_code, pace, workload, practical)
    if not result.get("found"):
        raise HTTPException(404, result.get("error", "Not found"))
    return result


class ToolRequest(BaseModel):
    args: dict = {}
    student_id: str | None = None


@app.post("/api/tools/{name}")
def run_tool(name: str, req: ToolRequest):
    """Run one tool directly (the pages show these results without going through the chat)."""
    if name not in tool_names():
        raise HTTPException(404, f"Unknown tool: {name}")
    if req.student_id and not students.get_student(req.student_id):
        raise HTTPException(404, "Student not found")
    return call_tool(name, req.args, req.student_id)


@app.get("/")
def index():
    return FileResponse(Path(__file__).resolve().parent / "static" / "index.html")


if __name__ == "__main__":
    # Hosting platforms pass the port in $PORT and need 0.0.0.0; locally the defaults are fine.
    uvicorn.run(app, host=os.getenv("HOST", "127.0.0.1"), port=int(os.getenv("PORT", "8000")))
