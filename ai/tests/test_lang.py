"""Language detection for the reply language (no network). Run from the repo root:
    .venv/Scripts/python.exe ai/tests/test_lang.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "chatbot"))
from lang import detect_language  # noqa: E402

CASES = [
    ("How many credit hours can I register this term?", "en"),
    ("Can I register Deep Learning (CSE 351)?", "en"),
    ("what's my GPA", "en"),
    ("Which dr should I take for embedded systems?", "en"),
    ("Am I on warning? cse351 needs ECE 332", "en"),
    ("اقدر اسجل كام ساعة؟", "ar"),
    ("هل ينفع اسجل CSE 351 الترم ده؟", "ar"),
    ("ايه الفرق بين الحذف والانسحاب", "ar"),
    ("ازاي اسجل GPA", "ar"),
    ("ana 3ayez a3raf ana gabt kam fel gpa", "franco"),
    ("ezay a3mel drop le mada?", "franco"),
    ("momken a2ol lel doctor ye3melo ba2a", "franco"),
    ("enta 3arf 7aga 3an el mohadra", "franco"),
    ("123 ؟", "ar"),
]
bad = [(t, want, detect_language(t)) for t, want in CASES if detect_language(t) != want]
for t, want in CASES:
    print(("ok   " if detect_language(t) == want else "FAIL ") + f"{want:6} {t}")
print(f"\n{len(bad)} failure(s)")
for t, want, got in bad:
    print(f" - {t!r}: wanted {want}, got {got}")
sys.exit(1 if bad else 0)
