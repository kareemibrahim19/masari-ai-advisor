/**
 * Recent chats, saved per student on the Masari AI service (ai/chatbot/chat_history.py), so they follow the
 * account to any device or browser. This browser's localStorage keeps a copy: the list shows at once while the
 * server answers, and the chat still works (in this browser only) when the service cannot be reached.
 *
 *   GET    {API}/api/students/{id}/chats            newest first
 *   PUT    {API}/api/students/{id}/chats/{chatId}   the whole chat, after each question and answer
 *   DELETE {API}/api/students/{id}/chats/{chatId}
 */
import { MASARI_API_URL } from "@/lib/api-url"
import type { ChatMessage } from "@/lib/demo-state"

export type SavedChat = { id: string; title: string; updatedAt: number; messages: ChatMessage[] }

const MAX_CHATS = 20
const key = (studentId: string) => `masari.chats.${studentId}`
// When this browser last got the list from the server: chats saved here after it may not have reached the server.
const syncedKey = (studentId: string) => `masari.chats.syncedAt.${studentId}`

const isChat = (c: SavedChat) => c && c.id && Array.isArray(c.messages)
const newestFirst = (list: SavedChat[]) => [...list].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CHATS)

export function loadChats(studentId: string): SavedChat[] {
  try {
    const raw = localStorage.getItem(key(studentId))
    const list = raw ? (JSON.parse(raw) as SavedChat[]) : []
    return Array.isArray(list) ? list.filter(isChat) : []
  } catch {
    return []
  }
}

export function saveChats(studentId: string, chats: SavedChat[]) {
  try {
    localStorage.setItem(key(studentId), JSON.stringify(chats.slice(0, MAX_CHATS)))
  } catch {}
}

const chatsUrl = (studentId: string, chatId?: string) =>
  `${MASARI_API_URL}/api/students/${encodeURIComponent(studentId)}/chats${chatId ? `/${encodeURIComponent(chatId)}` : ""}`

/** Saves one chat to the account. Failures are ignored: the copy in this browser is uploaded on the next sync. */
export function pushChat(studentId: string, chat: SavedChat) {
  fetch(chatsUrl(studentId, chat.id), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: chat.title, updatedAt: chat.updatedAt, messages: chat.messages }),
  }).catch(() => {})
}

export function dropChat(studentId: string, chatId: string) {
  fetch(chatsUrl(studentId, chatId), { method: "DELETE", keepalive: true }).catch(() => {})
}

/**
 * The account's chats from the server, plus the ones saved in this browser that the server does not have yet
 * (from before chats were saved to the account, or saved while it was unreachable), which are uploaded.
 * A chat older than the last sync and missing on the server was deleted elsewhere, so it is not brought back.
 * Rejects when the server cannot be reached; the caller then keeps the browser's list.
 */
export async function syncChats(studentId: string, local: SavedChat[], signal?: AbortSignal): Promise<SavedChat[]> {
  const startedAt = Date.now()
  const res = await fetch(chatsUrl(studentId), { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const server = ((await res.json()).chats as SavedChat[]).filter(isChat)

  let syncedAt = 0
  try {
    syncedAt = Number(localStorage.getItem(syncedKey(studentId))) || 0
  } catch {}
  const onServer = new Set(server.map((c) => c.id))
  const missing = local.filter((c) => !onServer.has(c.id) && c.updatedAt >= syncedAt)
  missing.forEach((c) => pushChat(studentId, c))
  try {
    localStorage.setItem(syncedKey(studentId), String(startedAt))
  } catch {}
  return newestFirst([...server, ...missing])
}

/** The chat's title: its first question, shortened. */
export function chatTitle(messages: ChatMessage[], lang: "ar" | "en" = "ar") {
  const first = messages.find((m) => m.role === "user")
  const text = !first ? "" : typeof first.text === "string" ? first.text : first.text[lang]
  return text.length > 70 ? `${text.slice(0, 70)}…` : text
}

/** Puts `chat` first (newest) and keeps at most MAX_CHATS. */
export const upsertChat = (list: SavedChat[], chat: SavedChat) => [chat, ...list.filter((c) => c.id !== chat.id)].slice(0, MAX_CHATS)
