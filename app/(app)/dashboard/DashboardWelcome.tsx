'use client'

import { useEffect, useState } from 'react'

export default function DashboardWelcome({ name }: { name: string }) {
  const text = `Selamat Datang, ${name}!`
  const [visible, setVisible] = useState('')
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const reducedTimer = window.setTimeout(() => setVisible(text), 0)
      return () => window.clearTimeout(reducedTimer)
    }
    let index = 0
    const timer = window.setInterval(() => {
      index += 1
      setVisible(text.slice(0, index))
      if (index >= text.length) window.clearInterval(timer)
    }, 48)
    return () => window.clearInterval(timer)
  }, [text])
  return <h1 aria-label={text}>{visible}<span aria-hidden="true" className="ml-0.5 inline-block h-[.9em] w-0.5 animate-pulse bg-[var(--color-brand)] align-[-.05em]" /></h1>
}
