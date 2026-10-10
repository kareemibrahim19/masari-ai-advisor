/**
 * Masari AI service (ai/chatbot/server.py). Override with NEXT_PUBLIC_MASARI_API_URL.
 * Without it, production builds use the hosted service so every Vercel copy of the site has a working chat.
 */
export const MASARI_API_URL =
  process.env.NEXT_PUBLIC_MASARI_API_URL ??
  (process.env.NODE_ENV === "production" ? "https://masari-ai-pink.vercel.app" : "http://localhost:8000")
