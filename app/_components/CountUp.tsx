'use client'

import { useEffect, useRef } from 'react'

/**
 * Renders the real value on the server (accessible, no layout shift) and, after
 * mount, eases the number up from 0. Skipped for reduced-motion users.
 */
export default function CountUp({ value, duration = 700 }: { value: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node || value <= 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
      node.textContent = String(Math.round(value * eased))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    node.textContent = '0'
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      node.textContent = String(value)
    }
  }, [value, duration])

  return <span ref={ref}>{value}</span>
}
