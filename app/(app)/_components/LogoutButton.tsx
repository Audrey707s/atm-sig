'use client'

// FR-001 — Tombol logout (versi compact untuk TopHeader)
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Props = { compact?: boolean }

export default function LogoutButton({ compact = false }: Props) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogout() {
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error: signOutError } = await supabase.auth.signOut()

      if (signOutError) {
        setError('Tidak dapat mengakhiri sesi. Silakan coba lagi.')
        return
      }

      router.replace('/login')
      router.refresh()
    } catch {
      setError('Tidak dapat terhubung ke layanan login. Silakan coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  if (compact) {
    return (
      <button
        id="btn-logout"
        onClick={handleLogout}
        disabled={loading}
        aria-busy={loading}
        title={loading ? 'Mengakhiri sesi...' : 'Keluar'}
        className="atm-ghost-btn h-8 w-8 disabled:opacity-50"
      >
        {/* Icon: Logout */}
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
          />
        </svg>
        <span className="sr-only">Keluar</span>
      </button>
    )
  }

  return (
    <>
      {error && (
        <p role="alert" className="mb-2 text-xs text-[var(--color-text-secondary)]">
          {error}
        </p>
      )}
      <button
        id="btn-logout"
        onClick={handleLogout}
        disabled={loading}
        aria-busy={loading}
        className="atm-ghost-btn w-full border border-[var(--color-border-strong)] px-3 py-2 text-xs font-medium
                   disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? 'Mengakhiri sesi...' : 'Keluar'}
      </button>
    </>
  )
}
