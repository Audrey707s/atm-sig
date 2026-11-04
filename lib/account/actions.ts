'use server'

import { revalidatePath } from 'next/cache'
import { getSessionUser } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

export type ProfileActionState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  name?: string
}

export async function updateMyProfile(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  await getSessionUser()
  const name = String(formData.get('name') ?? '').trim().replace(/\s+/g, ' ')

  if (name.length < 2 || name.length > 100) {
    return { status: 'error', message: 'Nama harus terdiri dari 2–100 karakter.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('update_my_profile', { p_name: name })

  if (error || !data) {
    return { status: 'error', message: 'Profil belum dapat disimpan. Silakan coba lagi.' }
  }

  revalidatePath('/', 'layout')
  return { status: 'success', message: 'Profil berhasil diperbarui.', name: data }
}
