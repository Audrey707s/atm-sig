'use client'
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { beginWhatsAppLink, disconnectWhatsApp, getMyWhatsApp, setWhatsAppNotifications } from '@/lib/whatsapp/linking'

export default function WhatsAppConnection({ phone, notifications }: { phone: string | null; notifications: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [message, setMessage] = useState('')
  const [link, setLink] = useState<{ code: string; bot: string; expires: string } | null>(null)
  const [verified, setVerified] = useState<{ phone: string; notifications: boolean } | null>(null)
  const activePhone = verified?.phone ?? phone
  const activeNotifications = verified?.notifications ?? notifications

  useEffect(() => {
    if (!link || activePhone) return
    let cancelled = false
    let checking = false
    const timer = window.setInterval(async () => {
      if (Date.now() >= Date.parse(link.expires)) {
        window.clearInterval(timer)
        if (!cancelled) { setLink(null); setMessage('Kode kedaluwarsa. Klik Hubungkan WhatsApp untuk membuat kode baru.') }
        return
      }
      if (checking || document.visibilityState !== 'visible' || !navigator.onLine) return
      checking = true
      try {
        const result = await getMyWhatsApp()
        if (!cancelled && result.phone) {
          setVerified({ phone: result.phone, notifications: result.notifications })
          setLink(null)
          setMessage('WhatsApp berhasil terhubung.')
          router.refresh()
        }
      } catch {
        // Keep waiting within the code's lifetime; do not report a false link.
      } finally { checking = false }
    }, 5_000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [link, activePhone, router])

  return <section className="atm-card overflow-hidden p-5 sm:p-7">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">WhatsApp ATM</h2>
      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${activePhone ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{activePhone ? 'Terhubung' : 'Belum terhubung'}</span>
    </div>
    {activePhone ? <div className="mt-4 space-y-4">
      <p className="break-all text-sm font-medium">+{activePhone}</p>
      <div className="rounded-xl border border-slate-200 p-4 text-sm">
        <p className="font-semibold">Mulai percakapan dengan MENU</p>
        <p className="mt-2 leading-relaxed">Balas angka pilihan. Ketik FITUR untuk seluruh menu, BUAT untuk tugas baru, atau pilih tugas untuk UBAH dan HAPUS. Setiap hasil menyertakan tautan pemeriksaan.</p>
      </div>
      <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={activeNotifications} disabled={pending} onChange={e => {
        const checked = e.target.checked
        start(async () => {
          const r = await setWhatsAppNotifications(checked)
          setMessage(r.error ?? 'Pengaturan disimpan.')
          if (!r.error) setVerified({ phone: activePhone, notifications: checked })
          router.refresh()
        })
      }} />Terima notifikasi WhatsApp</label>
      <button type="button" disabled={pending} className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50" onClick={() => start(async () => {
        const r = await disconnectWhatsApp()
        setMessage(r.error ?? 'Koneksi diputuskan.')
        if (!r.error) { setVerified(null); setLink(null) }
        router.refresh()
      })}>Putuskan koneksi</button>
    </div> : <>
      <button type="button" disabled={pending} className="mt-4 rounded-lg bg-[var(--color-brand)] px-4 py-2 font-medium text-white disabled:opacity-50" onClick={() => start(async () => {
        setMessage('')
        const r = await beginWhatsAppLink()
        if (r.error) setMessage(r.error)
        else if (r.code) setLink({ code: r.code, bot: r.bot, expires: r.expires })
      })}>Hubungkan WhatsApp</button>
      {link && <div className="mt-4 space-y-4 rounded-xl border border-slate-200 p-4 text-sm">
        <ol className="list-inside list-decimal space-y-2 leading-relaxed">
          <li>Buka WhatsApp dari nomor pribadi yang akan menerima notifikasi.</li>
          <li>Kirim pesan yang sudah disiapkan ke bot ATM.</li>
          <li>Tunggu balasan berhasil. Status di halaman ini diperbarui otomatis.</li>
        </ol>
        <a href={`https://wa.me/${link.bot}?text=${encodeURIComponent(`HUBUNGKAN ${link.code}`)}`} target="_blank" rel="noopener noreferrer" className="inline-flex rounded-lg bg-[var(--color-brand)] px-4 py-2 font-semibold text-white">Buka WhatsApp</a>
        <details><summary className="cursor-pointer font-medium">Lihat kode untuk dikirim manual</summary><code className="mt-2 block break-all rounded-lg bg-slate-100 p-3 text-slate-900">HUBUNGKAN {link.code}</code></details>
        <p role="status" className="font-medium">Menunggu pesan penghubung…</p>
        <p className="leading-relaxed">Kode berlaku 10 menit. Jangan bagikan kode. Mengirim kode mengaktifkan koneksi akun dan notifikasi WhatsApp.</p>
      </div>}
    </>}
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
  </section>
}
