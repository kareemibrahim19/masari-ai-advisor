"""Build one self-contained HTML file of the Masari chatbot for teammates to try.

The file embeds the chunks, a compressed copy of their embeddings, the rules and the
prompts, and calls Gemini straight from the browser with the user's OWN API key
(entered once, stored in their browser). No API key is ever written into the file.

Run from the repo root:
    .venv\\Scripts\\python.exe ai\\chatbot\\build_standalone.py
Output: ai/chatbot/dist/masari-chat.html
"""

import base64
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import rag  # noqa: E402

DIM = 768  # gemini-embedding-001 vectors can be truncated (Matryoshka); 768 keeps the file small


def main() -> None:
    bot = rag.Masari()  # loads chunks + cached embeddings (no API calls if cached)

    # Truncate to DIM, re-normalize, and quantize each value to one signed byte.
    v = bot.vectors[:, :DIM]
    v = v / np.linalg.norm(v, axis=1, keepdims=True)
    q = np.round(v / np.abs(v).max(axis=1, keepdims=True) * 127).astype(np.int8)

    data = {
        "chunks": [{"id": c["id"], "title": c["title"], "text": c["text"], "source": c["source"]}
                   for c in bot.chunks],
        "vecs": base64.b64encode(q.tobytes()).decode(),
        "dim": DIM,
        "rules": bot.rules_json,
        "systemPrompt": rag.SYSTEM_PROMPT,
        "rewritePrompt": rag.REWRITE_PROMPT,
        "chatModel": rag.CHAT_MODEL,
        "fallbackModels": rag.FALLBACK_MODELS,
        "rewriteModel": rag.REWRITE_MODEL,
        "embedModel": rag.EMBED_MODEL,
        "topK": rag.TOP_K,
        "timeoutMs": rag.MODEL_TIMEOUT_MS,
    }
    payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")

    template = (HERE / "standalone_template.html").read_text(encoding="utf-8")
    out = HERE / "dist" / "masari-chat.html"
    out.parent.mkdir(exist_ok=True)
    out.write_text(template.replace("__MASARI_DATA__", payload), encoding="utf-8")
    print(f"Wrote {out} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
