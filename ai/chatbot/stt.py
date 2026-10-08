"""Speech-to-text for the chat microphone, using the open-source Whisper large-v3-turbo model.

Two backends, chosen with STT_BACKEND in .env:
  - "groq" (default): Whisper hosted on Groq's free API. Fast and works on the hosted site. Needs GROQ_API_KEY.
  - "local": faster-whisper on this machine. No key, but needs `pip install faster-whisper`,
             downloads the model on first use and is slower on CPU. Not available on Vercel.
"""

import os
import tempfile

import httpx

STT_BACKEND = os.getenv("STT_BACKEND", "groq")
GROQ_MODEL = os.getenv("GROQ_STT_MODEL", "whisper-large-v3-turbo")
LOCAL_MODEL = os.getenv("LOCAL_STT_MODEL", "large-v3-turbo")
GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions"

# Short context so Whisper keeps course codes and program words spelled the way the data spells them.
PROMPT = "مساري، لائحة برنامج هندسة الذكاء الاصطناعي، تسجيل المواد، ARI 381، CSE 351، GPA، الترم الصيفي."

_local_model = None


class STTError(Exception):
    pass


def transcribe(audio: bytes, filename: str, language: str | None = None) -> str:
    """Return the text spoken in `audio`. `language` is "ar", "en" or None (auto-detect)."""
    if not audio:
        raise STTError("Empty recording")
    if STT_BACKEND == "local":
        return _transcribe_local(audio, filename, language)
    return _transcribe_groq(audio, filename, language)


def _transcribe_groq(audio: bytes, filename: str, language: str | None) -> str:
    key = os.getenv("GROQ_API_KEY")
    if not key:
        raise STTError("GROQ_API_KEY is not set")
    data = {"model": GROQ_MODEL, "response_format": "json", "temperature": "0", "prompt": PROMPT}
    if language:
        data["language"] = language
    try:
        r = httpx.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {key}"},
            data=data,
            files={"file": (filename, audio)},
            timeout=60,
        )
    except httpx.HTTPError as e:
        raise STTError(f"Groq request failed: {e}") from e
    if r.status_code != 200:
        raise STTError(f"Groq error {r.status_code}: {r.text[:300]}")
    return r.json().get("text", "").strip()


def _transcribe_local(audio: bytes, filename: str, language: str | None) -> str:
    global _local_model
    try:
        from faster_whisper import WhisperModel
    except ImportError as e:
        raise STTError("Local STT needs: pip install faster-whisper") from e
    if _local_model is None:
        _local_model = WhisperModel(LOCAL_MODEL, device="auto", compute_type="int8")
    suffix = os.path.splitext(filename)[1] or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(audio)
        path = f.name
    try:
        segments, _ = _local_model.transcribe(path, language=language, initial_prompt=PROMPT, vad_filter=True)
        return " ".join(s.text.strip() for s in segments).strip()
    finally:
        os.unlink(path)
