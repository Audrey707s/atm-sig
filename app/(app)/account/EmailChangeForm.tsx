'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function EmailChangeForm({pendingEmail, notice}: {pendingEmail?:string; notice?:string}) {
  const router = useRouter()
  const [pending, setPending] = useState(pendingEmail ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget
    setBusy(true); setMessage(''); setError('')
    try {
      const response = await fetch('/api/account/email', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:new FormData(form).get('email')})})
      const result = await response.json()
      if (!response.ok) { setError(typeof result.message === 'string' ? result.message : 'Perubahan email belum dapat diproses.'); return }
      setPending(result.pendingEmail); setMessage(result.message); form.reset(); router.refresh()
    } catch { setError('Status permintaan belum dapat dipastikan. Periksa kotak masuk atau coba lagi nanti.') }
    finally { setBusy(false) }
  }
  return <section className="atm-card p-5 sm:p-6" aria-labelledby="account-email-title">
    <h2 id="account-email-title" className="font-semibold">Email akun</h2>
    {notice === 'failed' && <p role="alert" className="mt-3 text-sm text-red-700">Tautan verifikasi tidak berlaku atau telah digunakan. Kirim ulang permintaan jika email belum berubah.</p>}
    {(notice === 'confirmed' || notice === 'check') && <p role="status" className="mt-3 text-sm text-emerald-700">Periksa email aktif pada Profil. Jika masih menunggu, selesaikan verifikasi pada alamat email lainnya lalu muat ulang.</p>}
    {(pending || pendingEmail) && <p className="mt-3 break-words text-sm text-amber-800" role="status">Menunggu verifikasi: {pending || pendingEmail}</p>}
    <details className="mt-3">
      <summary className="w-fit cursor-pointer rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">Ubah email</summary>
      <form onSubmit={submit} className="mt-4 max-w-lg space-y-4">
        <label className="block text-sm font-medium">Email baru<input name="email" type="email" autoComplete="email" required maxLength={254} disabled={busy} className="mt-2 w-full rounded-lg border px-3 py-2.5"/></label>
        <p className="text-sm text-[var(--color-text-muted)]">Verifikasi melalui email lama dan email baru. Email aktif diperbarui setelah seluruh konfirmasi selesai.</p>
        <button type="submit" disabled={busy} className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Mengirim…' : 'Kirim verifikasi'}</button>
      </form>
    </details>
    {message && <p className="mt-3 text-sm text-emerald-700" role="status">{message}</p>}
    {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
  </section>
}
