"use client"

/**
 * Microphone → text for the chat composer.
 * Records with the browser's MediaRecorder, then sends the clip to the Masari AI service
 * (POST /api/transcribe, Whisper large-v3-turbo) and hands the text back through `onText`.
 */
import * as React from "react"
import { MASARI_API_URL } from "@/lib/demo-state"

export type VoiceState = "idle" | "recording" | "transcribing"

// First format the browser can record; Whisper accepts all of them.
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]
const MAX_SECONDS = 60

export function useVoiceInput(onText: (text: string) => void) {
  const [state, setState] = React.useState<VoiceState>("idle")
  const [error, setError] = React.useState<string | null>(null)
  const recorder = React.useRef<MediaRecorder>(undefined)
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  const onTextRef = React.useRef(onText)
  React.useEffect(() => {
    onTextRef.current = onText
  }, [onText])

  const send = React.useCallback(async (blob: Blob) => {
    if (blob.size === 0) return setState("idle")
    setState("transcribing")
    const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm"
    const form = new FormData()
    form.append("audio", blob, `voice.${ext}`)
    try {
      const res = await fetch(`${MASARI_API_URL}/api/transcribe`, { method: "POST", body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`)
      if (data.text) onTextRef.current(data.text)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setState("idle")
    }
  }, [])

  const start = React.useCallback(async () => {
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      return setError("unsupported")
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      return setError("permission")
    }
    const mimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t))
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    rec.onstop = () => {
      clearTimeout(timer.current)
      stream.getTracks().forEach((t) => t.stop()) // turn the mic light off
      send(new Blob(chunks, { type: rec.mimeType }))
    }
    recorder.current = rec
    rec.start()
    setState("recording")
    timer.current = setTimeout(() => rec.state === "recording" && rec.stop(), MAX_SECONDS * 1000)
  }, [send])

  const stop = React.useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop()
  }, [])

  // Release the microphone if the page is left mid-recording.
  React.useEffect(() => () => {
    clearTimeout(timer.current)
    if (recorder.current?.state === "recording") {
      recorder.current.onstop = null
      recorder.current.stop()
      recorder.current.stream.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return { state, error, start, stop, toggle: state === "recording" ? stop : start }
}
