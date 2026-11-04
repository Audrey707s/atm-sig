'use client'

import { useEffect, useState } from 'react'

function formatJakartaTime(date: Date) {
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Jakarta',
  }).format(date)
}

/** Live local-time display only; no network polling or business data side effects. */
export default function JakartaClock() {
  const [time, setTime] = useState<string | null>(null)

  useEffect(() => {
    const update = () => setTime(formatJakartaTime(new Date()))
    const frame = requestAnimationFrame(update)
    const interval = setInterval(update, 15_000)
    return () => {
      cancelAnimationFrame(frame)
      clearInterval(interval)
    }
  }, [])

  return (
    <span
      aria-label={time ? `Waktu Jakarta ${time} WIB` : 'Memuat waktu Jakarta'}
      className="atm-mono !text-[var(--color-text-secondary)] hidden items-center gap-2 whitespace-nowrap rounded-full border border-[var(--color-border)] px-3 py-1.5 tabular-nums md:inline-flex"
      title="Waktu Jakarta diperbarui otomatis"
    >
      <span className="atm-live-indicator" aria-hidden="true" />
      {time ? `${time} WIB` : '--:-- WIB'}
    </span>
  )
}
