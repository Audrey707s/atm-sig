import WorkspaceTabs, { WORK_TABS } from '../_components/WorkspaceTabs'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getSessionUser, requireRole } from '@/lib/auth/session'
import { ROLE_LEVELS } from '@/lib/constants/rbac'
import { getAllTaskList, getTaskFilterOptions } from '@/lib/tasks/queries'
import { getActiveTaskWorkloads, getMonthDayCount, getTimelineBarPosition } from '@/lib/tasks/timeline'

export const metadata: Metadata = { title: 'Timeline Task' }

type Params = { month?: string; section?: string; owner?: string }
function monthDate(value: string) { return new Date(`${value}T00:00:00+07:00`) }
function currentMonth() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit' }).formatToParts(new Date())
  const year = parts.find((part) => part.type === 'year')?.value ?? ''
  const month = parts.find((part) => part.type === 'month')?.value ?? ''
  return `${year}-${month}`
}
export default async function TimelinePage({ searchParams }: { searchParams: Promise<Params> }) {
  const [params, user] = await Promise.all([searchParams, getSessionUser()])
  requireRole(user, 'Manager')
  const monthMatch = params.month?.match(/^(\d{4})-(\d{2})$/)
  const month = monthMatch && Number(monthMatch[1]) >= 1900 && Number(monthMatch[1]) <= 2100
    && Number(monthMatch[2]) >= 1 && Number(monthMatch[2]) <= 12
    ? params.month!
    : currentMonth()
  const first = `${month}-01`
  const last = `${month}-${String(getMonthDayCount(month)).padStart(2, '0')}`
  const parsedSection = params.section && /^\d+$/.test(params.section) ? Number(params.section) : null
  const sectionId = parsedSection && Number.isSafeInteger(parsedSection) && parsedSection > 0 ? parsedSection : null
  const ownerId = params.owner && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.owner) ? params.owner : null
  // Opsi filter dan daftar task independen — jalankan paralel.
  const [options, { items }] = await Promise.all([
    getTaskFilterOptions(user),
    getAllTaskList(user, { ownerId, orgUnitId: sectionId, dateFrom: first, dateTo: last }),
  ])
  const dayCount = getMonthDayCount(month)
  const days = Array.from({ length: dayCount }, (_, index) => index + 1)
  const workloads = getActiveTaskWorkloads(items)
  const taskGroups = [...new Map(items.map((task) => [task.ownerId, { id: task.ownerId, name: task.ownerName, tasks: [] as typeof items }])).values()]
  for (const task of items) taskGroups.find((group) => group.id === task.ownerId)?.tasks.push(task)
  const canEditDirectly = user.roleLevel >= ROLE_LEVELS.Manager

  return <main className="mx-auto max-w-[1600px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
    <WorkspaceTabs current="/timeline" tabs={WORK_TABS} roleLevel={user.roleLevel} />
    <nav className="flex gap-2 text-xs font-semibold" aria-label="Tampilan task"><Link href="/kanban" className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100">Kanban</Link><Link href="/timeline" aria-current="page" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">Timeline Gantt</Link></nav>
    <header><h1 className="text-2xl font-bold tracking-tight text-slate-900">Linimasa Tugas</h1></header>
    <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3"><input className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm" type="month" name="month" defaultValue={month}/><select className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm" name="section" defaultValue={params.section ?? ''}><option value="">Semua seksi</option>{options.sections.map((s)=><option key={s.id} value={s.id}>{s.name}</option>)}</select><div className="flex gap-2"><select className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm" name="owner" defaultValue={params.owner ?? ''}><option value="">Semua PIC</option>{options.owners.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700">Terapkan</button></div></form>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Grafik Gantt task"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4"><div><h2 className="text-sm font-bold text-slate-900">Jadwal per PIC</h2><p className="mt-1 text-xs text-slate-500">Bar menunjukkan rentang tanggal inklusif dan warna merah menandai task lewat.</p></div><span className="text-xs text-slate-500">{new Intl.DateTimeFormat('id-ID',{month:'long',year:'numeric',timeZone:'Asia/Jakarta'}).format(monthDate(first))}</span></div>
      <div className="overflow-x-auto"><div className="min-w-[1100px]"><div className="grid grid-cols-[220px_1fr] border-b border-slate-200 bg-slate-50"><div className="px-4 py-2 text-xs font-semibold text-slate-600">Task / PIC</div><div className="grid" style={{gridTemplateColumns:`repeat(${dayCount}, minmax(24px, 1fr))`}}>{days.map((day)=><div key={day} className={`border-l border-slate-100 py-2 text-center text-[10px] ${[1,8,15,22,29].includes(day)?'font-bold text-slate-700':'text-slate-400'}`}>{day}</div>)}</div></div>
      {taskGroups.map((group) => <div key={group.id}>
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2"><span className="text-xs font-bold text-slate-700">{group.name}</span><span className="text-[10px] text-slate-500">{group.tasks.filter((task) => task.status !== 'Done').length} task aktif</span></div>
        {group.tasks.map((task) => {
          const bar = getTimelineBarPosition(task.startDate, task.dueDate, month)
          const style = statusColor(task.status, task.isOverdue)
          const dateRange = `${task.startDate.slice(0, 10)} – ${task.dueDate.slice(0, 10)}`
          return <div key={task.id} className="grid grid-cols-[220px_1fr] border-b border-slate-100 last:border-0">
            <div className="min-w-0 px-4 py-2.5"><Link href={`/tasks/${task.id}`} className="block truncate text-xs font-semibold text-slate-800 hover:text-red-700">{task.title}</Link><p className="mt-1 truncate text-[10px] text-slate-500">{task.orgUnitName} · {task.status}</p></div>
            <div className="relative grid items-center" style={{ gridTemplateColumns: `repeat(${dayCount}, minmax(24px, 1fr))` }}>
              {days.map((day) => <div key={day} className="h-full min-h-12 border-l border-slate-100" />)}
              {bar.visible && <div role="img" aria-label={`${task.title}, ${dateRange}, ${task.status}, ${task.progressPct}%`} className={`absolute z-[1] flex h-6 min-w-2 items-center overflow-hidden rounded-md px-2 text-[9px] font-bold text-white shadow-sm ${style}`} style={{ left: `${bar.leftPct}%`, width: `max(8px, calc(${bar.widthPct}% - 4px))` }} title={`${dateRange} · ${task.status}`}>{task.progressPct}%</div>}
            </div>
          </div>
        })}
      </div>)}
      {items.length===0 && <p className="p-10 text-center text-sm text-slate-500">Tidak ada task pada periode dan filter ini.</p>}</div></div>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-sm font-bold text-slate-900">Beban kerja per PIC</h2><p className="text-xs text-slate-500">Jumlah task aktif pada periode terpilih (task Done dikecualikan)</p></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{workloads.map((person)=>{const pct=Math.max(6,Math.round(person.count/Math.max(1,...workloads.map((x)=>x.count))*100));return <div key={person.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3"><div className="flex justify-between gap-2 text-xs"><span className="font-semibold text-slate-700">{person.name}</span><span className="font-bold text-slate-900">{person.count} task</span></div><div className="mt-2 h-1.5 rounded-full bg-slate-200"><div className="h-1.5 rounded-full bg-red-600" style={{width:`${pct}%`}}/></div></div>})}{workloads.length===0&&<p className="text-xs text-slate-500">Belum ada tugas aktif dalam periode ini.</p>}</div></section>
    <p className="text-xs text-slate-500">{canEditDirectly?'Ubah tenggat dapat dilakukan dari detail task sesuai kewenangan Anda.':'Untuk mengajukan perubahan tenggat, buka detail task dan gunakan formulir pengajuan.'} </p>
  </main>
}

function statusColor(status: string, overdue: boolean) {
  if (overdue) return 'bg-red-600'
  if (status === 'Done') return 'bg-emerald-600'
  if (status === 'Blocked') return 'bg-amber-500'
  if (status === 'Review') return 'bg-violet-600'
  if (status === 'Revisi') return 'bg-orange-500'
  if (status === 'To do') return 'bg-slate-500'
  return 'bg-blue-600'
}
