import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

export class EmailChangeError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

export function parseEmailChange(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  if (Object.keys(body).length !== 1 || typeof body.email !== 'string') return null
  const email = body.email.trim().toLowerCase()
  return email.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ? email : null
}

export async function requestMyEmailChange(client: SupabaseClient<Database>, email: string, origin: string) {
  const { data: { user }, error: authError } = await client.auth.getUser()
  if (authError || !user?.email) throw new EmailChangeError('Silakan masuk kembali.', 401)
  const { data: profile, error: profileError } = await client.from('users').select('status').eq('id', user.id).maybeSingle()
  if (profileError || profile?.status !== 'aktif') throw new EmailChangeError('Akun tidak dapat mengubah email.', 403)
  if (email === user.email.toLowerCase()) throw new EmailChangeError('Email baru sama dengan email saat ini.', 400)
  const { data, error } = await client.auth.updateUser({ email }, {
    emailRedirectTo: new URL('/auth/email-change', origin).toString(),
  })
  if (error) throw new EmailChangeError(error.status === 429
    ? 'Terlalu banyak permintaan. Tunggu sebentar sebelum mengirim ulang.'
    : 'Verifikasi belum dapat dikirim. Periksa email baru atau coba lagi nanti.', error.status === 429 ? 429 : 400)
  return {
    pendingEmail: data.user?.new_email || email,
    message: 'Permintaan terkirim. Selesaikan verifikasi di email lama dan email baru. Email login lama tetap digunakan sampai verifikasi selesai.',
  }
}
