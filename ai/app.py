"""Entrypoint for hosting the Masari AI service on Vercel (deployed with ai/ as the project root).

Vercel finds the FastAPI instance named `app` in app.py automatically.
"""

from chatbot.server import app  # noqa: F401
