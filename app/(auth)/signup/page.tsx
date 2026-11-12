import type { Metadata } from 'next'
import Link from 'next/link'
import AuthPageShell from '../_components/AuthPageShell'
import SignupForm from './_components/SignupForm'

export const metadata: Metadata = {
  title: 'Daftar akun',
  description: 'Buat akun Accounting Task Manager.',
}

export default function SignupPage() {
  return (
    <AuthPageShell title="Daftar akun">
      <SignupForm />
      <p className="mt-5 text-center text-sm text-slate-600">Sudah punya akun? <Link href="/login" className="font-medium text-slate-900 underline underline-offset-4">Masuk</Link></p>
    </AuthPageShell>
  )
}
