"""Masari chat server.

Run from the repo root:
    .venv\\Scripts\\python.exe ai\\chatbot\\server.py
then open http://localhost:8000
"""

import os
import sys
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from google.genai import errors
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rag import Masari  # noqa: E402

app = FastAPI(title="Masari AI Advisor")
# Let the Next.js frontend (another origin) call /api/chat from the browser.
# Comma-separated list, e.g. "http://localhost:3000,https://masari.example.com".
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("MASARI_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(","),
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
)
bot = Masari()  # builds / loads the search index once at startup


class Message(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    question: str
    history: list[Message] = []


@app.post("/api/chat")
def chat(req: ChatRequest):
    if not req.question.strip():
        raise HTTPException(400, "Empty question")
    try:
        return bot.answer(req.question.strip(), [m.model_dump() for m in req.history])
    except errors.APIError as e:
        raise HTTPException(502, f"Gemini error {e.code}: {e.message}")


@app.get("/")
def index():
    return FileResponse(Path(__file__).resolve().parent / "static" / "index.html")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
