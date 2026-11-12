// FR-001, FR-002 — Halaman login ATM
// Responsive single-column sign-in: mobile full-width, desktop centered card

import type { Metadata } from 'next'
import { Suspense } from 'react'
import AuthPageShell from '../_components/AuthPageShell'
import LoginForm from './_components/LoginForm'

export const metadata: Metadata = {
  title: 'Masuk',
  description: 'Masuk ke Accounting Task Manager PT Semen Indonesia Group',
}

type LoginPageProps = {
  searchParams: Promise<{ error?: string | string[]; notice?: string | string[] }>
}

async function LoginNotice({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const errorCode = Array.isArray(params.error) ? params.error[0] : params.error
  const noticeCode = Array.isArray(params.notice) ? params.notice[0] : params.notice
  const notice = errorCode === 'account_inactive'
    ? 'Akun Anda nonaktif. Hubungi administrator untuk meminta akses kembali.'
    : errorCode === 'account_unavailable'
      ? 'Login berhasil, tetapi profil atau role akun tidak dapat diverifikasi. Hubungi administrator untuk memeriksa profil akun di sistem.'
      : errorCode === 'invite_invalid'
        ? 'Tautan undangan tidak valid atau sudah kedaluwarsa. Minta administrator mengirim ulang.'
        : errorCode === 'auth_link_invalid'
          ? 'Tautan autentikasi tidak valid atau kedaluwarsa. Silakan minta tautan baru.'
          : noticeCode === 'email_confirmed'
            ? 'Email berhasil dikonfirmasi. Silakan masuk.'
            : noticeCode === 'password_updated'
              ? 'Kata sandi berhasil diperbarui. Silakan masuk dengan kata sandi baru.'
              : null

  if (!notice) return null
  return (
    <div
        role="alert"
        className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
        {notice}
    </div>
  )
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  return (
    <AuthPageShell title="Masuk">
        <Suspense fallback={null}>
          <LoginNotice searchParams={searchParams} />
        </Suspense>
        <LoginForm />

        <div className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm">
          <a href="/signup" className="font-medium text-slate-700 underline underline-offset-4">
            Daftar akun
          </a>
          <a href="/forgot-password" className="font-medium text-slate-700 underline underline-offset-4">
            Lupa kata sandi?
          </a>
        </div>
    </AuthPageShell>
  )
}
