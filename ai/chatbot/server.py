"""Masari chat server.

Run from the repo root:
    .venv\\Scripts\\python.exe ai\\chatbot\\server.py
then open http://localhost:8000
"""

import os
import sys
from pathlib import Path

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from google.genai import errors
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rag import Masari  # noqa: E402  (also loads .env)
import stt  # noqa: E402
import students  # noqa: E402
import chat_history  # noqa: E402
import student_choices  # noqa: E402
import seats  # noqa: E402
import auth  # noqa: E402
import security  # noqa: E402
from db import source as data_source  # noqa: E402  (students.py put ai/ on the path)
from tools.planner import build_graduation_plan, plan_options  # noqa: E402
from tools import priorities  # noqa: E402
from tools import call_tool, tool_names  # noqa: E402
from tools import instructors as instructor_tools  # noqa: E402

app = FastAPI(title="Masari AI Advisor")
# Let the Next.js frontend (another origin) call the API from the browser. The known site domains are always
# allowed, so a new deployment works without touching the host settings; MASARI_CORS_ORIGINS (comma-separated)
# adds more, e.g. "https://masari.example.com".
KNOWN_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://masari-web-sigma.vercel.app",
]
# strip() drops spaces and a stray BOM that some shells add when the value is piped in.
EXTRA_ORIGINS = [o.strip().lstrip(chr(0xFEFF)) for o in os.getenv("MASARI_CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(dict.fromkeys(KNOWN_ORIGINS + EXTRA_ORIGINS)),
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)
app.include_router(auth.router)  # password sign-in; auth.check() keeps each student's data to that student
app.include_router(chat_history.router)  # recent chats saved per student (database)
app.include_router(student_choices.router)  # chosen courses per student (database)
app.include_router(seats.router)  # seats per section, and seat requests for full sections
bot = Masari()  # builds / loads the search index once at startup
priorities.warm_up()  # the graduation delays behind the dashboard's course priorities, in the background

# Every chat question and recording costs a model call, so one student (or one address) gets a fair share.
# Change with MASARI_CHAT_PER_MINUTE / MASARI_CHAT_PER_DAY.
chat_per_minute = security.RateLimiter(int(os.getenv("MASARI_CHAT_PER_MINUTE", "10")), 60)
chat_per_day = security.RateLimiter(int(os.getenv("MASARI_CHAT_PER_DAY", "200")), 24 * 3600)


def limit_model_calls(request: Request, student_id: str | None) -> None:
    key = auth.signed_in(request) or student_id or auth.client_address(request)
    for limiter in (chat_per_minute, chat_per_day):
        if wait := limiter.hit(key):
            raise HTTPException(429, "أسئلة كتير ورا بعض، استنى دقيقة وجرّب تاني.",
                                headers={"Retry-After": str(int(wait) + 1)})


class Message(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    question: str
    history: list[Message] = []
    student_id: str | None = None  # the selected student; without it the student-data tools are not offered
    # What the website currently holds for this student, so the chat agrees with the recommendations page:
    # The schedule on the courses tab: what is chosen, what may be chosen (by priority, with credits) and the limit.
    selected_courses: list[str] = []
    eligible_courses: list[dict] = []  # [{"code": "CSE 151", "credits": 3}, ...]
    max_load: float | None = None
    # The graduation plan page's choice, so the chat answers for the same target.
    plan_target: float | None = None
    plan_summer: bool | None = None


@app.post("/api/chat")
def chat(req: ChatRequest, request: Request):
    auth.check(request, req.student_id)
    if not req.question.strip():
        raise HTTPException(400, "Empty question")
    limit_model_calls(request, req.student_id)
    if req.student_id and not students.get_student(req.student_id):
        raise HTTPException(404, "Student not found")
    try:
        session = {"selected_courses": req.selected_courses, "eligible_courses": req.eligible_courses,
                   "max_load": req.max_load, "plan_target": req.plan_target, "plan_summer": req.plan_summer}
        return bot.answer(req.question.strip(), [m.model_dump() for m in req.history], req.student_id, session)
    except errors.APIError as e:
        if e.code == 429:  # the model quota is used up for now
            raise HTTPException(503, "مساري مشغول دلوقتي بسبب كتر الطلبات، جرّب تاني بعد دقيقة.")
        raise HTTPException(502, f"Gemini error {e.code}: {e.message}")


class PlanRequest(BaseModel):
    student_id: str
    target_years: float = 5  # 4, 4.5 or 5
    allow_summer: bool = True
    # What-if: current-term courses the student fails, and the term GPA they expect.
    failed_courses: list[str] = []
    expected_term_gpa: float | None = None


@app.post("/api/plan")
def plan(req: PlanRequest, request: Request):
    """Graduation plan for the plan page: the plan, the plan without the what-if (to compare), and which
    targets are reachable with / without summer."""
    auth.check(request, req.student_id)
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
async def transcribe(request: Request, audio: UploadFile = File(...), language: str | None = Form(None)):
    """Speech-to-text for the chat microphone (Whisper). Returns {"text": "..."}."""
    auth.check(request)
    limit_model_calls(request, None)
    data = await audio.read()
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(413, "Recording is too long")
    try:
        return {"text": stt.transcribe(data, audio.filename or "audio.webm", language or None)}
    except stt.STTError as e:
        raise HTTPException(502, str(e))


@app.get("/api/health")
def health():
    """Quick check after a deploy: is the service up, does it read students from the database or the files, and
    is the sign-in protection on?"""
    return {"ok": True, "data_source": data_source.active(), "auth_required": auth.required()}


@app.get("/api/students")
def list_students():
    """Mock students for the frontend's "choose a student" screen (one card per student). Not offered once the
    sign-in protection is on: it would show every student to anyone."""
    if auth.required():
        raise HTTPException(404, "Not found")
    return {"students": students.list_students()}


@app.get("/api/students/{student_id}")
def get_student(student_id: str, request: Request):
    """Full record of one student: personal, contact, guardian, qualification, academic status, all terms."""
    auth.check(request, student_id)
    s = students.get_student(student_id)
    if not s:
        raise HTTPException(404, "Student not found")
    return s


@app.get("/api/students/{student_id}/graduation-delays")
def graduation_delays(student_id: str, request: Request):
    """For each course of the current term: how many semesters later the student graduates without passing it
    (tools/priorities.py). The website turns it into the course's priority."""
    auth.check(request, student_id)
    result = priorities.graduation_delays(student_id)
    if not result.get("found"):
        raise HTTPException(404, result.get("error", "Student not found"))
    return result


@app.get("/api/instructors/recommendations")
def instructor_recommendations(student_id: str, request: Request):
    """The recommendations page: each course the student is registered in this term, with its instructors ranked by
    how students did with them over the last 10 years (expected total for the student's GPA band, pass rate,
    the coursework average out of its marks) and the course's 10-year history for the column chart. Same model as the chat's
    recommend_instructor tool; the page adds the course priority from the graduation plan itself."""
    auth.check(request, student_id)
    result = instructor_tools.recommendations_for(student_id)
    if not result.get("found"):
        raise HTTPException(404, "Student not found")
    return result


class ToolRequest(BaseModel):
    args: dict = {}
    student_id: str | None = None


@app.post("/api/tools/{name}")
def run_tool(name: str, req: ToolRequest, request: Request):
    """Run one tool directly (the pages show these results without going through the chat)."""
    auth.check(request, req.student_id)
    if "student_id" in req.args:  # a student typed into the tool's arguments must be the caller too
        auth.check(request, str(req.args["student_id"]))
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
