"use client"

import * as React from "react"

/**
 * A localStorage-backed value read through useSyncExternalStore.
 * The server (and first hydration pass) always sees `fallback`, so markup matches;
 * the stored value is applied right after without a setState-in-effect cascade.
 */
export function createStoredValue<T extends string>(key: string, fallback: T, isValid: (v: string) => v is T) {
  const listeners = new Set<() => void>()

  const read = (): T => {
    try {
      const v = localStorage.getItem(key)
      return v !== null && isValid(v) ? v : fallback
    } catch {
      return fallback
    }
  }

  const subscribe = (cb: () => void) => {
    listeners.add(cb)
    const onStorage = (e: StorageEvent) => e.key === key && cb()
    window.addEventListener("storage", onStorage)
    return () => {
      listeners.delete(cb)
      window.removeEventListener("storage", onStorage)
    }
  }

  const set = (v: T) => {
    try {
      localStorage.setItem(key, v)
    } catch {}
    listeners.forEach((l) => l())
  }

  return function useStored(): [T, (v: T) => void] {
    const value = React.useSyncExternalStore(subscribe, read, () => fallback)
    return [value, set]
  }
}
