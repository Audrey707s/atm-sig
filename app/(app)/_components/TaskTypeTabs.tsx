import Link from 'next/link'

export default function TaskTypeTabs({ current }: { current: 'once' | 'recurring' }) {
  return (
    <nav aria-label="Jenis tugas" className="mx-auto flex max-w-3xl flex-wrap justify-center gap-2 px-4 pt-5 sm:px-6 lg:px-8">
      {[
        { key: 'once', href: '/tasks/new', label: 'Tugas Sekali Jalan' },
        { key: 'recurring', href: '/tasks/recurring', label: 'Tugas Berulang' },
      ].map((tab) => (
        <Link key={tab.key} href={tab.href} aria-current={current === tab.key ? 'page' : undefined}
          className={`rounded-lg border px-4 py-2 text-sm font-semibold ${current === tab.key ? 'border-red-700 bg-red-700 text-white' : 'border-slate-300 text-slate-700'}`}>
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
