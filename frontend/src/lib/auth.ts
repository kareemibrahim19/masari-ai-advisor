/**
 * Password sign-in with the AI service (ai/chatbot/auth.py) and the token every request carries.
 *
 *   POST /api/auth/login { student_id, password } -> { token, expires_at, student }
 *   401 wrong student ID or password · 429 too many tries (Retry-After) · 503 sign-in not set up on the server
 *
 * The token lives in sessionStorage next to the student id (closing the tab signs out). apiFetch() adds
 * "Authorization: Bearer <token>" to every request; a 401 on any of them means the token is no longer
 * valid, so the student is signed out and the app shell sends them to /login.
 */
import { MASARI_API_URL } from "@/lib/api-url"
import type { StudentFileEntry } from "@/lib/data/types"

const TOKEN_KEY = "masari.token"
const EXPIRES_KEY = "masari.tokenExpires"
const STUDENT_KEY = "masari.studentId"
/** Fired on window when the server rejects the token; the student context signs out. */
export const SIGNED_OUT_EVENT = "masari:signed-out"

export function getToken(): string | null {
  try {
    const token = sessionStorage.getItem(TOKEN_KEY)
    const expires = Number(sessionStorage.getItem(EXPIRES_KEY) ?? 0)
    if (!token) return null
    if (expires && expires * 1000 <= Date.now()) {
      clearSession()
      return null
    }
    return token
  } catch {
    return null
  }
}

export function savedStudentId(): string | null {
  try {
    return getToken() ? sessionStorage.getItem(STUDENT_KEY) : null
  } catch {
    return null
  }
}

function saveSession(token: string, expiresAt: number, studentId: string) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token)
    sessionStorage.setItem(EXPIRES_KEY, String(expiresAt))
    sessionStorage.setItem(STUDENT_KEY, studentId)
  } catch {}
}

export function clearSession() {
  try {
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(EXPIRES_KEY)
    sessionStorage.removeItem(STUDENT_KEY)
  } catch {}
}

/** An error answer from the service: `status` is the HTTP status, `retryAfter` the seconds to wait on 429. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfter: number | null = null
  ) {
    super(message)
  }
}

/** fetch() to the AI service with the sign-in token. A 401 signs the student out everywhere. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken()
  const headers = new Headers(init.headers)
  if (token) headers.set("Authorization", `Bearer ${token}`)
  const res = await fetch(`${MASARI_API_URL}${path}`, { ...init, headers })
  if (res.status === 401 && token) {
    clearSession()
    window.dispatchEvent(new Event(SIGNED_OUT_EVENT))
  }
  return res
}

/** Throws ApiError for a non-OK answer (with the service's `detail` message when it gives one). */
export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.detail || `HTTP ${res.status}`, res.status, retryAfterOf(res))
  return data as T
}

const retryAfterOf = (res: Response) => {
  const v = Number(res.headers.get("Retry-After"))
  return Number.isFinite(v) && v > 0 ? v : null
}

export type LoginResult =
  | { ok: true; student: StudentFileEntry }
  | { ok: false; reason: "wrong" | "too_many" | "unavailable"; retryAfter?: number | null }

/** Signs in on the server (never from the offline copy of the data). */
export async function login(studentId: string, password: string): Promise<LoginResult> {
  let res: Response
  try {
    res = await fetch(`${MASARI_API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ student_id: studentId, password }),
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    return { ok: false, reason: "unavailable" }
  }
  if (res.status === 401) return { ok: false, reason: "wrong" }
  if (res.status === 429) return { ok: false, reason: "too_many", retryAfter: retryAfterOf(res) }
  if (!res.ok) return { ok: false, reason: "unavailable" }
  const data = (await res.json()) as { token: string; expires_at: number; student: StudentFileEntry }
  saveSession(data.token, data.expires_at, data.student.student_id)
  return { ok: true, student: data.student }
}
