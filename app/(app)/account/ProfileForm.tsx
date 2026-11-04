'use client'

import { useActionState, useEffect, useRef } from 'react'
import { updateMyProfile, type ProfileActionState } from '@/lib/account/actions'

const initialState: ProfileActionState = { status: 'idle' }

export default function ProfileForm({
  initialName,
  email,
  role,
  unitName,
}: {
  initialName: string
  email: string
  role: string
  unitName: string
}) {
  const [state, formAction, pending] = useActionState(updateMyProfile, initialState)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (state.status === 'success' && state.name && inputRef.current) {
      inputRef.current.value = state.name
    }
  }, [state])

  return (
    <form action={formAction} className="atm-card max-w-4xl overflow-hidden">
      <div className="border-b px-5 py-4 sm:px-6" style={{ borderColor: 'var(--color-hairline)' }}>
        <h2 className="text-base font-semibold">Informasi akun</h2>
      </div>
      <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
        <label className="sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium">Nama lengkap</span>
          <input ref={inputRef} name="name" defaultValue={initialName} minLength={2} maxLength={100} required autoComplete="name" className="w-full border px-3 py-2.5 text-sm" />
        </label>
        <label>
          <span className="mb-1.5 block text-sm font-medium">Email</span>
          <input value={email} readOnly aria-readonly="true" className="w-full cursor-not-allowed border px-3 py-2.5 text-sm opacity-70" />
        </label>
        <label>
          <span className="mb-1.5 block text-sm font-medium">Role</span>
          <input value={role} readOnly aria-readonly="true" className="w-full cursor-not-allowed border px-3 py-2.5 text-sm opacity-70" />
        </label>
        <label className="sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium">Unit / seksi</span>
          <input value={unitName} readOnly aria-readonly="true" className="w-full cursor-not-allowed border px-3 py-2.5 text-sm opacity-70" />
        </label>
      </div>
      <div className="flex min-h-16 items-center justify-between gap-4 border-t px-5 py-3 sm:px-6" style={{ borderColor: 'var(--color-hairline)' }}>
        <div aria-live="polite" className={`text-sm ${state.status === 'error' ? 'text-red-600' : 'text-emerald-700'}`}>
          {state.message}
        </div>
        <button type="submit" disabled={pending} className="shrink-0 rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-wait disabled:opacity-60">
          {pending ? 'Menyimpan…' : 'Simpan profil'}
        </button>
      </div>
    </form>
  )
}
