import { useEffect, useRef } from 'react'
import { API_BASE_URL } from '@/shared/lib/api'
import { tryRefresh } from '@/shared/lib/apiClient'
import { useAuthStore } from '@/core/auth/store/authStore'

const DEBOUNCE_MS = 5000
const WINDOW_EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'focus', 'popstate']
const DOCUMENT_EVENTS = ['visibilitychange']

export function useSessionActivity() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isAuthenticated) return

    tryRefresh()

    const onActivity = () => {
      if (document.visibilityState === 'hidden') return
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => { tryRefresh() }, DEBOUNCE_MS)
    }

    for (const evt of WINDOW_EVENTS) {
      window.addEventListener(evt, onActivity, { passive: true })
    }
    for (const evt of DOCUMENT_EVENTS) {
      document.addEventListener(evt, onActivity, { passive: true })
    }

    let preemptiveTimer: ReturnType<typeof setInterval> | null = null
    fetch(`${API_BASE_URL}/auth/config`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return
        const sessionMinutes = data.sessionLifetime || 480
        const intervalMs = Math.min(sessionMinutes / 2, 30) * 60_000
        preemptiveTimer = setInterval(() => { tryRefresh() }, intervalMs)
      })
      .catch(() => {})

    return () => {
      for (const evt of WINDOW_EVENTS) {
        window.removeEventListener(evt, onActivity)
      }
      for (const evt of DOCUMENT_EVENTS) {
        document.removeEventListener(evt, onActivity)
      }
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (preemptiveTimer) clearInterval(preemptiveTimer)
    }
  }, [isAuthenticated])
}
