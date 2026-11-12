import type { ReactNode } from 'react'
import ATMWordmark from '@/app/_components/ATMWordmark'
import ThemeToggle from '@/app/_components/ThemeToggle'

type Props = {
  title: string
  description?: string
  children: ReactNode
}

export default function AuthPageShell({ title, description, children }: Props) {
  return (
    <main className="atm-login-page relative flex min-h-dvh w-full items-center justify-center bg-white px-4 py-20 sm:px-8 sm:py-10">
      <div className="absolute right-4 top-4 sm:right-8 sm:top-6">
        <ThemeToggle />
      </div>
      <section
        aria-labelledby="auth-heading"
        className="atm-login-card mx-auto w-full max-w-[440px] rounded-2xl border border-red-100 bg-white px-6 py-8 shadow-[0_10px_35px_-4px_rgba(230,150,150,0.12)] sm:px-9 sm:py-9"
      >
        <div className="mb-4 flex justify-center">
          <ATMWordmark variant="dark" showSubtitle className="w-[min(62vw,224px)] sm:w-[240px]" />
        </div>
        <h1 id="auth-heading" className="mb-6 text-center text-[22px] font-bold tracking-tight text-slate-900">
          {title}
        </h1>
        {description && (
          <p className="mb-6 -mt-4 text-center text-sm leading-relaxed text-slate-600">
            {description}
          </p>
        )}
        {children}
      </section>
    </main>
  )
}
