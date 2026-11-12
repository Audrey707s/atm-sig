'use client'

import { useEffect, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'

const SYNC_INTERVAL_MS = 30_000
const TASK_VIEWS = new Set([
  '/dashboard', '/tasks', '/review-inbox', '/reports', '/calendar',
  '/kanban', '/timeline', '/notifications', '/performance', '/jobload',
])

/** Refresh server-authorized data after changes made outside this browser. */
export default function TaskDataSync() {
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!TASK_VIEWS.has(pathname) && !/^\/tasks\/[a-f0-9-]{36}$/i.test(pathname)) return
    let lastRefresh = Date.now()
    const refresh = () => {
      if (isPending || document.visibilityState !== 'visible' || !navigator.onLine) return
      if (Date.now() - lastRefresh < SYNC_INTERVAL_MS) return
      // Defer while editing or using a modal; preserve local form work.
      const active = document.activeElement
      if (active?.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) return
      if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return
      lastRefresh = Date.now()
      startTransition(() => router.refresh())
    }
    const timer = window.setInterval(refresh, SYNC_INTERVAL_MS)
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [pathname, router, isPending])

  return null
}
