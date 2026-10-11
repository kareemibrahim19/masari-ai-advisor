/**
 * Recent chats, saved per student in this browser's localStorage, so they are still there after
 * closing the site or signing out and back in with the same account.
 */
import type { ChatMessage } from "@/lib/demo-state"

export type SavedChat = { id: string; title: string; updatedAt: number; messages: ChatMessage[] }

const MAX_CHATS = 20
const key = (studentId: string) => `masari.chats.${studentId}`

export function loadChats(studentId: string): SavedChat[] {
  try {
    const raw = localStorage.getItem(key(studentId))
    const list = raw ? (JSON.parse(raw) as SavedChat[]) : []
    return Array.isArray(list) ? list.filter((c) => c && c.id && Array.isArray(c.messages)) : []
  } catch {
    return []
  }
}

export function saveChats(studentId: string, chats: SavedChat[]) {
  try {
    localStorage.setItem(key(studentId), JSON.stringify(chats.slice(0, MAX_CHATS)))
  } catch {}
}

/** The chat's title: its first question, shortened. */
export function chatTitle(messages: ChatMessage[], lang: "ar" | "en" = "ar") {
  const first = messages.find((m) => m.role === "user")
  const text = !first ? "" : typeof first.text === "string" ? first.text : first.text[lang]
  return text.length > 70 ? `${text.slice(0, 70)}…` : text
}

/** Puts `chat` first (newest) and keeps at most MAX_CHATS. */
export const upsertChat = (list: SavedChat[], chat: SavedChat) => [chat, ...list.filter((c) => c.id !== chat.id)].slice(0, MAX_CHATS)
