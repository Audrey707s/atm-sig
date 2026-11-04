'use client'

import { FormEvent, useActionState, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { updateMyProfile, type ProfileActionState } from '@/lib/account/actions'
import { PROFILE_AVATAR_BUCKET } from '@/lib/account/avatar'
import ProfileAvatar from '../_components/ProfileAvatar'

const initialState: ProfileActionState = { status: 'idle' }

export default function ProfileForm({ userId, initialName, email, role, unitName, avatarUrl }: {
  userId: string; initialName: string; email: string; role: string; unitName: string; avatarUrl: string
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(updateMyProfile, initialState)
  const [avatar, setAvatar] = useState(avatarUrl)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarMessage, setAvatarMessage] = useState<string | null>(null)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const displayName = state.status === 'success' && state.name ? state.name : initialName

  async function uploadAvatar(file?: File) {
    if (!file) return
    setAvatarMessage(null)
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setAvatarMessage('Gunakan gambar JPG, PNG, atau WebP.')
    if (file.size > 2 * 1024 * 1024) return setAvatarMessage('Ukuran foto maksimal 2 MB.')
    setAvatarBusy(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.storage.from(PROFILE_AVATAR_BUCKET).upload(`${userId}/avatar`, file, { upsert: true, contentType: file.type, cacheControl: '0' })
      if (error) throw error
      setAvatar(URL.createObjectURL(file))
      setAvatarMessage('Foto profil berhasil diperbarui.')
      router.refresh()
    } catch { setAvatarMessage('Foto profil belum dapat disimpan. Silakan coba lagi.') }
    finally { setAvatarBusy(false); if (fileRef.current) fileRef.current.value = '' }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPasswordError(null); setPasswordMessage(null)
    const form = event.currentTarget
    const data = new FormData(form)
    const oldPassword = String(data.get('oldPassword') ?? '')
    const newPassword = String(data.get('newPassword') ?? '')
    if (newPassword !== String(data.get('confirmation') ?? '')) return setPasswordError('Password baru tidak sama.')
    if (newPassword.length < 8) return setPasswordError('Password baru minimal 8 karakter.')
    setPasswordBusy(true)
    try {
      const supabase = createClient()
      const { error: verificationError } = await supabase.auth.signInWithPassword({ email, password: oldPassword })
      if (verificationError) return setPasswordError('Password lama salah.')
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) return setPasswordError('Password belum dapat diubah. Silakan coba lagi.')
      form.reset(); setPasswordOpen(false); setPasswordMessage('Password berhasil diubah.')
    } catch { setPasswordError('Password belum dapat diubah. Silakan coba lagi.') }
    finally { setPasswordBusy(false) }
  }

  return <>
    <section className="atm-card overflow-hidden">
      <div className="h-24 bg-[linear-gradient(105deg,var(--color-brand),#ff8f89)] sm:h-28" />
      <div className="px-5 pb-6 sm:px-7">
        <div className="-mt-12 flex flex-col gap-5 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-4">
            <div className="relative rounded-full bg-[var(--color-bg-card)] p-1.5">
              <ProfileAvatar name={displayName} src={avatar} className="h-24 w-24 text-2xl sm:h-28 sm:w-28" />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={avatarBusy} aria-label="Ganti foto profil" className="absolute bottom-1 right-1 grid h-9 w-9 place-items-center rounded-full border-2 border-[var(--color-bg-card)] bg-[var(--color-brand)] text-white transition-transform hover:scale-105 disabled:opacity-60">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>
              </button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={event => uploadAvatar(event.target.files?.[0])} />
            </div>
            <div className="pb-2"><h2 className="text-xl font-semibold">{displayName}</h2><p className="mt-1 text-sm text-[var(--color-text-muted)]">{email}</p></div>
          </div>
          <p aria-live="polite" className="pb-2 text-sm text-[var(--color-text-muted)]">{avatarBusy ? 'Mengunggah foto…' : avatarMessage}</p>
        </div>
        <form action={formAction} className="mt-7 border-t pt-6" style={{ borderColor: 'var(--color-hairline)' }}>
          <div className="grid gap-5 sm:grid-cols-2">
            <label><span className="mb-1.5 block text-sm font-medium">Nama lengkap</span><input name="name" defaultValue={displayName} minLength={2} maxLength={100} required autoComplete="name" className="w-full border px-3 py-2.5 text-sm" /></label>
            <label><span className="mb-1.5 block text-sm font-medium">Email</span><input value={email} readOnly className="w-full cursor-not-allowed border px-3 py-2.5 text-sm opacity-70" /></label>
            <label><span className="mb-1.5 block text-sm font-medium">Role</span><input value={role} readOnly className="w-full cursor-not-allowed border px-3 py-2.5 text-sm opacity-70" /></label>
            <label><span className="mb-1.5 block text-sm font-medium">Unit / seksi</span><input value={unitName} readOnly className="w-full cursor-not-allowed border px-3 py-2.5 text-sm opacity-70" /></label>
          </div>
          <div className="mt-6 flex min-h-10 items-center justify-between gap-4"><p aria-live="polite" className={`text-sm ${state.status === 'error' ? 'text-red-600' : 'text-emerald-700'}`}>{state.message}</p><button type="submit" disabled={pending} className="shrink-0 rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">{pending ? 'Menyimpan…' : 'Simpan perubahan'}</button></div>
        </form>
      </div>
    </section>
    <section className="atm-card mt-5 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div><h2 className="font-semibold">Keamanan akun</h2><p className="mt-1 text-sm text-[var(--color-text-muted)]">Perbarui password dengan verifikasi password lama.</p>{passwordMessage && <p className="mt-2 text-sm text-emerald-700" role="status">{passwordMessage}</p>}</div>
      <button type="button" onClick={() => { setPasswordOpen(true); setPasswordError(null) }} className="rounded-full border px-5 py-2.5 text-sm font-semibold">Ubah password</button>
    </section>
    {passwordOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" onMouseDown={event => { if (event.target === event.currentTarget && !passwordBusy) setPasswordOpen(false) }}>
      <section role="dialog" aria-modal="true" aria-labelledby="password-title" className="atm-card w-full max-w-md p-6">
        <div className="flex items-start justify-between gap-4"><h2 id="password-title" className="text-lg font-semibold">Ubah password</h2><button type="button" aria-label="Tutup" onClick={() => setPasswordOpen(false)} disabled={passwordBusy} className="text-2xl text-[var(--color-text-muted)]">×</button></div>
        <form onSubmit={changePassword} className="mt-5 space-y-4">
          {passwordError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{passwordError}</p>}
          <label className="block text-sm font-medium">Password lama<input name="oldPassword" type="password" autoComplete="current-password" required disabled={passwordBusy} className="mt-1 block min-h-11 w-full border px-3" /></label>
          <label className="block text-sm font-medium">Password baru<input name="newPassword" type="password" autoComplete="new-password" minLength={8} required disabled={passwordBusy} className="mt-1 block min-h-11 w-full border px-3" /></label>
          <label className="block text-sm font-medium">Ulangi password baru<input name="confirmation" type="password" autoComplete="new-password" minLength={8} required disabled={passwordBusy} className="mt-1 block min-h-11 w-full border px-3" /></label>
          <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setPasswordOpen(false)} disabled={passwordBusy} className="rounded-full border px-4 py-2 text-sm font-semibold">Batal</button><button type="submit" disabled={passwordBusy} className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{passwordBusy ? 'Menyimpan…' : 'Simpan password'}</button></div>
        </form>
      </section>
    </div>}
  </>
}
