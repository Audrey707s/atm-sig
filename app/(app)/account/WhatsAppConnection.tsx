'use client'
import { useState,useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { beginWhatsAppLink,disconnectWhatsApp,setWhatsAppNotifications } from '@/lib/whatsapp/linking'
export default function WhatsAppConnection({phone,notifications}:{phone:string|null;notifications:boolean}) {
  const router=useRouter()
  const [pending,start]=useTransition()
  const [message,setMessage]=useState('')
  const [link,setLink]=useState<{code:string;bot:string;expires:string}|null>(null)
  return <section className="atm-card p-5 sm:p-7">
    <h2 className="text-lg font-semibold">WhatsApp</h2>
    {phone ? <>
      <p className="mt-3 text-sm">Terhubung: +{phone}</p>
      <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={notifications} disabled={pending} onChange={e=>{const checked=e.target.checked;start(async()=>{const r=await setWhatsAppNotifications(checked);setMessage(r.error??'Pengaturan disimpan.');router.refresh()})}}/>Terima notifikasi WhatsApp</label>
      <button type="button" disabled={pending} className="mt-4 rounded-lg border px-4 py-2 text-sm" onClick={()=>start(async()=>{const r=await disconnectWhatsApp();setMessage(r.error??'Koneksi diputuskan.');setLink(null);router.refresh()})}>Putuskan koneksi</button>
    </> : <>
      <button type="button" disabled={pending} className="mt-4 rounded-lg bg-[var(--color-brand)] px-4 py-2 font-medium text-white disabled:opacity-50" onClick={()=>start(async()=>{const r=await beginWhatsAppLink();if(r.error)setMessage(r.error);else if(r.code)setLink({code:r.code,bot:r.bot,expires:r.expires})})}>Hubungkan WhatsApp</button>
      {link&&<div className="mt-4 space-y-3 text-sm">
        <p>Kirim pesan ini dari WhatsApp milik Anda. Berlaku 10 menit. Jangan bagikan kodenya.</p>
        <code className="block break-all rounded-lg bg-slate-100 p-3 text-slate-900">HUBUNGKAN {link.code}</code>
        <a href={`https://wa.me/${link.bot}?text=${encodeURIComponent(`HUBUNGKAN ${link.code}`)}`} target="_blank" rel="noopener noreferrer" className="inline-block font-semibold underline underline-offset-4">Buka WhatsApp</a>
        <p>Dengan mengirim kode, Anda menghubungkan nomor ini ke akun ATM dan mengaktifkan notifikasi tugas melalui Fonnte.</p>
        <button type="button" className="block underline underline-offset-4" onClick={()=>router.refresh()}>Periksa koneksi</button>
      </div>}
    </>}
    {message&&<p role="status" className="mt-3 text-sm">{message}</p>}
  </section>
}
