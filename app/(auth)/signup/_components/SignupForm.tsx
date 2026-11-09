'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// Memetakan error Supabase Auth ke pesan yang bisa ditindaklanjuti.
// Sengaja tidak membedakan "email sudah terdaftar" agar tidak membocorkan akun.
function signupErrorMessage(error: { code?: string; status?: number; message?: string }): string {
  switch (error.code) {
    case 'over_email_send_rate_limit':
      return 'Batas pengiriman email konfirmasi tercapai. Coba lagi nanti atau hubungi administrator.'
    case 'over_request_rate_limit':
      return 'Terlalu banyak percobaan dalam waktu singkat. Tunggu beberapa menit lalu coba lagi.'
    case 'email_address_invalid':
      return 'Alamat email ditolak. Gunakan alamat email yang valid dan aktif.'
    case 'weak_password':
      return 'Kata sandi terlalu lemah. Gunakan minimal 8 karakter dengan kombinasi huruf, angka, dan simbol.'
    case 'signup_disabled':
    case 'email_provider_disabled':
      return 'Pendaftaran sedang dinonaktifkan. Hubungi administrator.'
    case 'unexpected_failure':
      return 'Akun belum dapat dibuat. Coba lagi nanti atau hubungi administrator.'
    default:
      return 'Pendaftaran belum dapat diproses. Periksa data dan coba lagi.'
  }
}

export default function SignupForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setNotice(null)

    if (!name.trim()) {
      setError('Nama wajib diisi.')
      return
    }
    if (password !== confirmation) {
      setError('Konfirmasi kata sandi tidak sama.')
      return
    }

    setBusy(true)
    try {
      const callbackUrl = new URL('/auth/confirm', window.location.origin)
      callbackUrl.searchParams.set('next', 'email-confirmed')
      const supabase = createClient()
      const { data, error: signupError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { name: name.trim() },
          emailRedirectTo: callbackUrl.toString(),
        },
      })

      if (signupError) {
        // Detail teknis hanya ke console browser untuk debugging (tanpa data pengguna).
        console.error('[signup] gagal', {
          code: signupError.code,
          status: signupError.status,
          message: signupError.message,
        })
        setError(signupErrorMessage(signupError))
        return
      }

      if (data.session) {
        const { error: signOutError } = await supabase.auth.signOut()
        if (signOutError) {
          setError('Akun dibuat, tetapi sesi tidak dapat ditutup. Hubungi administrator sebelum melanjutkan.')
          return
        }
        setError('Akun dibuat, tetapi konfirmasi email belum dapat dilakukan. Hubungi administrator sebelum masuk.')
        return
      }

      setNotice('Jika pendaftaran dapat diproses, email konfirmasi akan dikirim. Periksa kotak masuk dan folder spam sebelum masuk. Akun baru mendapat akses Spectator.')
      setPassword('')
      setConfirmation('')
    } catch {
      setError('Tidak dapat terhubung ke layanan pendaftaran. Silakan coba lagi.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      <div>
        <label htmlFor="signup-name" className="mb-1.5 block text-sm font-medium text-slate-700">Nama</label>
        <input id="signup-name" type="text" autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} className="min-h-11 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900" disabled={busy} />
      </div>
      <div>
        <label htmlFor="signup-email" className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
        <input id="signup-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="min-h-11 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900" disabled={busy} />
      </div>
      <div>
        <label htmlFor="signup-password" className="mb-1.5 block text-sm font-medium text-slate-700">Kata sandi</label>
        <input id="signup-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} className="min-h-11 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900" disabled={busy} />
      </div>
      <div>
        <label htmlFor="signup-password-confirm" className="mb-1.5 block text-sm font-medium text-slate-700">Ulangi kata sandi</label>
        <input id="signup-password-confirm" type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="min-h-11 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900" disabled={busy} />
      </div>
      <button type="submit" disabled={busy} className="min-h-11 w-full rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
        {busy ? 'Mendaftarkan...' : 'Daftar'}
      </button>
    </form>
  )
}