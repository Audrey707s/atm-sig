import WorkspaceTabs, { WORK_TABS } from '../_components/WorkspaceTabs'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getSessionUser, requireRole } from '@/lib/auth/session'
import { getAllTaskList, getTaskFilterOptions } from '@/lib/tasks/queries'
import KanbanBoard from './KanbanBoard'

export const metadata: Metadata = { title: 'Kanban Task' }

type Params = { owner?: string; section?: string; priority?: 'rendah'|'sedang'|'tinggi'; from?: string; to?: string }
function validDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null
}

export default async function KanbanPage({ searchParams }: { searchParams: Promise<Params> }) {
  const [params, user] = await Promise.all([searchParams, getSessionUser()])
  requireRole(user, 'Manager')
  const parsedSection = params.section && /^\d+$/.test(params.section) ? Number(params.section) : null
  const sectionId = parsedSection && Number.isSafeInteger(parsedSection) && parsedSection > 0 ? parsedSection : null
  const ownerId = params.owner && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.owner) ? params.owner : null
  const priority = params.priority && ['rendah', 'sedang', 'tinggi'].includes(params.priority) ? params.priority : null
  const dateFrom = validDate(params.from)
  const dateTo = validDate(params.to)
  // Opsi filter dan daftar task independen — jalankan paralel.
  const [options, { items }] = await Promise.all([
    getTaskFilterOptions(user),
    getAllTaskList(user, {
      ownerId,
      orgUnitId: sectionId,
      priority,
      dateFrom: dateFrom && dateTo && dateFrom > dateTo ? null : dateFrom,
      dateTo: dateFrom && dateTo && dateFrom > dateTo ? null : dateTo,
    }),
  ])
  return <main className="mx-auto max-w-[1800px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
    <WorkspaceTabs current="/kanban" tabs={WORK_TABS} roleLevel={user.roleLevel} />
    <header><h1 className="text-2xl font-bold tracking-tight text-slate-900">Papan Tugas</h1></header>
    <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-5">
      <select className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm" name="section" defaultValue={params.section ?? ''}><option value="">Semua seksi</option>{options.sections.map((s)=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <select className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm" name="owner" defaultValue={params.owner ?? ''}><option value="">Semua PIC</option>{options.owners.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <select className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm" name="priority" defaultValue={params.priority ?? ''}><option value="">Semua prioritas</option><option value="tinggi">Tinggi</option><option value="sedang">Sedang</option><option value="rendah">Rendah</option></select>
      <input className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm" type="date" aria-label="Mulai periode" name="from" defaultValue={validDate(params.from) ?? ''}/><div className="flex gap-2"><input className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm" type="date" aria-label="Akhir periode" name="to" defaultValue={validDate(params.to) ?? ''}/><button className="rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700">Terapkan</button><Link href="/kanban" className="flex items-center rounded-lg border border-slate-200 px-3 text-xs text-slate-600">Atur ulang</Link></div>
    </form>
    <KanbanBoard tasks={items} user={user}/>
  </main>
}
