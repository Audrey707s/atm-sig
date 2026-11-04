'use client'

// D-030 — Top Header navigasi ATM (sesuai Stitch mockup 04_dashboard)
// Header netral (Sanity-style): blur + hairline, logo, tanggal, tema, notifikasi, akun

import { type SessionUser } from '@/lib/auth/session'
import ATMWordmark from '@/app/_components/ATMWordmark'
import ThemeToggle from '@/app/_components/ThemeToggle'
import JakartaClock from './JakartaClock'
import Link from 'next/link'
import LogoutButton from './LogoutButton'

type Props = { user: SessionUser; unreadCount?: number }

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('')
}

function getTodayLabel(): string {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(new Date())
}

export default function TopHeader({ user, unreadCount = 0 }: Props) {
  const initials = getInitials(user.name)
  const today = getTodayLabel()

  return (
    <header
      className="atm-header relative z-20 flex shrink-0 items-center justify-between gap-2 px-3 sm:px-6"
      style={{ height: 'var(--header-height)' }}
    >
      <div className="flex min-w-0 shrink-0 items-center gap-3">
        <Link href="/dashboard" aria-label="ATM — beranda" className="rounded-md transition-opacity hover:opacity-80">
          <ATMWordmark variant="dark" className="w-[88px] sm:w-[104px]" />
        </Link>
        <span aria-hidden="true" className="hidden h-4 w-px bg-[var(--color-border-strong)] md:block" />
        <span className="atm-eyebrow hidden md:inline">Accounting Task Manager</span>
      </div>

      <div className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-3">
        <JakartaClock />
        <span className="atm-eyebrow hidden lg:inline">{today}</span>
        <ThemeToggle />
        <Link
          href="/notifications"
          aria-label={unreadCount > 0 ? `Notifikasi: ${unreadCount} belum dibaca` : 'Buka notifikasi'}
          className="atm-ghost-btn relative h-9 w-9 shrink-0"
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-brand)] px-1 font-[family-name:var(--font-mono)] text-[10px] font-semibold text-white ring-2 ring-[var(--color-bg-app)]">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Link>

        <div className="flex items-center gap-2 border-l border-[var(--color-border)] pl-2 sm:gap-3 sm:pl-3">
          <div className="hidden text-right leading-tight sm:block">
            <p className="text-xs font-medium tracking-tight text-[var(--color-text-primary)]">{user.name}</p>
            <p className="atm-eyebrow !text-[10px]">{user.role}</p>
          </div>
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg-raised)] font-[family-name:var(--font-mono)] text-[11px] font-semibold text-[var(--color-text-primary)]"
            aria-label={`Avatar ${user.name}`}
          >
            {initials}
          </div>
          <LogoutButton compact />
        </div>
      </div>
    </header>
  )
}
