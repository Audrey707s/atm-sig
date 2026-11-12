import type { Metadata } from 'next'
import Link from 'next/link'
import AuthPageShell from '../_components/AuthPageShell'
import ForgotPasswordForm from './_components/ForgotPasswordForm'

export const metadata: Metadata = {
  title: 'Lupa kata sandi',
  description: 'Minta tautan untuk mengatur ulang kata sandi.',
}

export default function ForgotPasswordPage() {
  return (
    <AuthPageShell title="Lupa kata sandi?">
      <ForgotPasswordForm />
      <p className="mt-5 text-center text-sm text-slate-600"><Link href="/login" className="font-medium text-slate-900 underline underline-offset-4">Kembali ke masuk</Link></p>
    </AuthPageShell>
  )
}
