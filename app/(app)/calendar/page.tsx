import Link from 'next/link'
import type { Metadata } from 'next'
import { getSessionUser } from '@/lib/auth/session'
import { calendarMonth, getCalendarTasks, googleCalendarLink, jakartaDay } from '@/lib/tasks/calendar-view'
import { StatusBadge } from '../_components/ui/Badges'

export const metadata: Metadata = { title: 'Kalender Tugas' }
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; scope?: string; day?: string }> }) {
  const [user, params] = await Promise.all([getSessionUser(), searchParams])
  const calendar = calendarMonth(typeof params.month === 'string' ? params.month : undefined)
  const personal = user.roleLevel === 2 || params.scope === 'mine'
  const tasks = await getCalendarTasks(user, calendar.month, personal)
  const today = jakartaDay(new Date().toISOString())
  const requestedDay = typeof params.day === 'string' ? params.day : ''
  const selectedDay = /^\d{4}-\d{2}-\d{2}$/.test(requestedDay) && requestedDay.startsWith(calendar.month) && Number(requestedDay.slice(-2)) >= 1 && Number(requestedDay.slice(-2)) <= calendar.days
    ? requestedDay : today.startsWith(calendar.month) ? today : tasks[0] ? jakartaDay(tasks[0].dueDate) : calendar.dueFrom
  const byDay = new Map<string, typeof tasks>()
  for (const task of tasks) { const day = jakartaDay(task.dueDate); byDay.set(day, [...(byDay.get(day) ?? []), task]) }
  const href = (month: string, day?: string) => `/calendar?${new URLSearchParams({ month, scope: personal ? 'mine' : 'all', ...(day ? { day } : {}) })}`
  const monthLabel = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${calendar.month}-01T00:00:00Z`))
  const button = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-red-600'
  return <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-bold text-slate-900">Kalender Tugas</h1>
      <form action="/calendar" className="flex flex-wrap gap-2">
        <input type="month" name="month" defaultValue={calendar.month} aria-label="Bulan kalender" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        {user.roleLevel !== 2 && <select name="scope" defaultValue={personal ? 'mine' : 'all'} aria-label="Cakupan kalender" className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="all">Sesuai hak akses</option><option value="mine">Tugas dan review saya</option></select>}
        <button className={button}>Tampilkan</button>
      </form>
    </header>
    <section className="atm-card overflow-hidden" aria-label={`Kalender ${monthLabel}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <h2 className="font-semibold">{monthLabel} <span className="text-sm font-normal text-slate-500">· {tasks.length} tugas</span></h2>
        <nav className="flex gap-2" aria-label="Navigasi bulan"><Link className={button} href={href(calendar.previous)} aria-label="Bulan sebelumnya">←</Link><Link className={button} href={href(today.slice(0, 7), today)}>Hari ini</Link><Link className={button} href={href(calendar.next)} aria-label="Bulan berikutnya">→</Link></nav>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[630px]">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-semibold">{['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map(day => <div className="py-3" key={day}>{day}</div>)}</div>
          <div className="grid grid-cols-7">
            {Array.from({ length: calendar.offset }, (_, i) => <div key={`blank-${i}`} className="min-h-24 border-b border-r border-slate-100 bg-slate-50/40" />)}
            {Array.from({ length: calendar.days }, (_, index) => {
              const day = `${calendar.month}-${String(index + 1).padStart(2, '0')}`
              const items = byDay.get(day) ?? []
              return <Link key={day} href={href(calendar.month, day)} aria-label={`${index + 1} ${monthLabel}, ${items.length} tugas`} aria-current={selectedDay === day ? 'date' : undefined} className={`min-h-24 border-b border-r border-slate-200 p-2 transition hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-600 ${selectedDay === day ? 'bg-red-50 ring-1 ring-inset ring-red-600' : ''}`}>
                <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${day === today ? 'bg-red-600 text-white' : 'text-slate-700'}`}>{index + 1}</span>
                {items.slice(0, 2).map(task => <span key={task.id} className={`mt-1 block truncate rounded px-1 py-0.5 text-[11px] ${task.status === 'Done' ? 'bg-emerald-50 text-emerald-800' : task.isOverdue ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700'}`} title={task.title}>{task.title}</span>)}
                {items.length > 2 && <span className="mt-1 block text-[11px] font-semibold text-slate-500">+{items.length - 2} lainnya</span>}
              </Link>
            })}
          </div>
        </div>
      </div>
    </section>
    <section className="atm-card p-4" aria-label="Tugas pada tanggal terpilih">
      <h2 className="mb-3 font-semibold">{new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${selectedDay}T00:00:00Z`))}</h2>
      {(byDay.get(selectedDay) ?? []).length === 0 ? <p className="text-sm text-slate-500">Tidak ada tenggat tugas pada tanggal ini.</p> : <ul className="divide-y divide-slate-200">{byDay.get(selectedDay)!.map(task => <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0"><Link href={`/tasks/${task.id}`} className="font-semibold text-slate-900 hover:text-red-600">{task.title}</Link><p className="mt-1 text-xs text-slate-500">PIC: {task.ownerName} · {task.reviewerId === user.id && task.ownerId !== user.id ? 'Anda reviewer' : task.orgUnitName}</p></div>
        <div className="flex flex-wrap items-center gap-3"><StatusBadge status={task.status} /><a href={googleCalendarLink(task)} target="_blank" rel="noopener noreferrer" className={button}>Tambah ke Google Calendar</a></div>
      </li>)}</ul>}
      <details className="mt-4 text-xs text-slate-500"><summary className="cursor-pointer font-semibold">Tentang Google Calendar</summary><p className="mt-2">Tombol membuka draf acara tenggat di akun Google Anda. Periksa lalu simpan di Google Calendar. Perubahan tugas di ATM-SIG tidak memperbarui acara Google secara otomatis.</p></details>
    </section>
  </div>
}
