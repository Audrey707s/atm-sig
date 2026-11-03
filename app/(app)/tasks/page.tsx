import WorkspaceTabs, { WORK_TABS } from '../_components/WorkspaceTabs'
// FR-029 — Halaman Daftar Task
// Sesuai Stitch mockup 06_daftar_task: tabel task dengan filter, search, status badge

import type { Metadata } from 'next'
import { getSessionUser } from '@/lib/auth/session'
import { getTaskFilterOptions, getTaskList } from '@/lib/tasks/queries'
import { StatusBadge, PriorityBadge, ProgressBar } from '../_components/ui/Badges'
import Link from 'next/link'
import type { TaskStatus } from '@/lib/constants/rbac'

export const metadata: Metadata = { title: 'Daftar Tugas' }

type SearchParams = {
  status?: string
  priority?: string
  search?: string
  section?: string
  owner?: string
  mine?: string
  month?: string
  page?: string
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(iso))
}

function isValidStatus(s: string): s is TaskStatus {
  return ['To do', 'In progress', 'Blocked', 'Review', 'Revisi', 'Done'].includes(s)
}

function isValidPriority(s: string): s is 'rendah' | 'sedang' | 'tinggi' {
  return ['rendah', 'sedang', 'tinggi'].includes(s)
}

const STATUS_OPTIONS: Array<{ value: TaskStatus | ''; label: string }> = [
  { value: '', label: 'Semua Status' },
  { value: 'To do', label: 'Belum Dimulai' },
  { value: 'In progress', label: 'Dalam Pengerjaan' },
  { value: 'Blocked', label: 'Terhambat' },
  { value: 'Review', label: 'Menunggu Tinjauan' },
  { value: 'Revisi', label: 'Perlu Revisi' },
  { value: 'Done', label: 'Selesai' },
]

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const [params, user] = await Promise.all([searchParams, getSessionUser()])

  const statusFilter = params.status && isValidStatus(params.status) ? params.status : null
  const priorityFilter =
    params.priority && isValidPriority(params.priority) ? params.priority : null
  const searchFilter = params.search || null
  const sectionFilter = params.section && /^\d+$/.test(params.section)
    ? Number(params.section)
    : null
  const isMine = user.roleLevel < 3 || params.mine === '1'
  const ownerFilter = isMine ? user.id : params.owner || null
  const monthFilter = params.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : null
  const createdFromFilter = monthFilter ? `${monthFilter}-01` : null
  const createdToFilter = monthFilter
    ? new Date(Date.UTC(Number(monthFilter.slice(0, 4)), Number(monthFilter.slice(5, 7)), 0)).toISOString().slice(0, 10)
    : null
  const page = parseInt(params.page ?? '1', 10)

  const [{ items: tasks, total }, filterOptions] = await Promise.all([
    getTaskList(user, {
      status: statusFilter,
      priority: priorityFilter,
      search: searchFilter,
      orgUnitId: sectionFilter,
      ownerId: ownerFilter,
      createdFrom: createdFromFilter,
      createdTo: createdToFilter,
      page,
      pageSize: 20,
    }),
    user.roleLevel===2 ? Promise.resolve({sections:[],owners:[]}) : getTaskFilterOptions(user),
  ])

  const totalPages = Math.ceil(total / 20)

  function buildHref(overrides: Partial<SearchParams>) {
    const merged = { ...params, ...overrides }
    const qs = new URLSearchParams()
    if (merged.status) qs.set('status', merged.status)
    if (merged.priority) qs.set('priority', merged.priority)
    if (merged.search) qs.set('search', merged.search)
    if (merged.section) qs.set('section', merged.section)
    if (merged.owner && !isMine) qs.set('owner', merged.owner)
    if (isMine) qs.set('mine', '1')
    if (merged.month) qs.set('month', merged.month)
    if (merged.page && merged.page !== '1') qs.set('page', merged.page)
    const str = qs.toString()
    return `/tasks${str ? `?${str}` : ''}`
  }

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8">
      <WorkspaceTabs current={isMine ? '/tasks?mine=1' : '/tasks'} tabs={WORK_TABS} roleLevel={user.roleLevel} />
      {/* Judul + tombol buat task */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 uppercase">
            {isMine ? 'Tugas Saya' : 'Tugas Tim'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {total} tugas ditemukan
          </p>
        </div>
        {user.roleLevel >= 2 && (
          <Link
            href="/tasks/new"
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-lg shadow-sm transition"
            style={{ backgroundColor: 'var(--color-brand)' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Buat Tugas
          </Link>
        )}
      </div>

      {/* Tabel task */}
      {tasks.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center shadow-sm">
          <p className="text-sm text-slate-400">
            {searchFilter || statusFilter
              ? 'Tidak ada tugas yang sesuai filter.'
              : 'Belum ada tugas.'}
          </p>
          {user.roleLevel >= 3 && (
            <Link
              href="/tasks/new"
              className="inline-block mt-4 text-sm font-medium text-[var(--color-brand)] hover:underline"
            >
              Buat tugas baru →
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
          <form id="task-table-filter" action="/tasks" method="get" />
          <table className="w-full min-w-[1040px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 tracking-wider bg-slate-50/60">
                <th className="py-3 px-4 font-semibold" scope="col">TANGGAL</th>
                <th className="py-3 px-4 font-semibold" scope="col">TUGAS</th>
                <th className="py-3 px-4 font-semibold" scope="col">PIC</th>
                <th className="py-3 px-4 font-semibold" scope="col">TENGGAT</th>
                <th className="py-3 px-4 font-semibold" scope="col">PRIORITAS</th>
                <th className="py-3 px-4 font-semibold" scope="col">KEMAJUAN</th>
                <th className="py-3 px-4 font-semibold" scope="col">STATUS</th>
              </tr>
              <tr className="border-b border-slate-200 bg-white align-top">
                <th className="px-3 py-2"><input form="task-table-filter" type="month" name="month" defaultValue={monthFilter ?? ''} aria-label="Filter bulan dan tahun" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs font-normal" />{isMine&&<input form="task-table-filter" type="hidden" name="mine" value="1" />}</th>
                <th className="px-3 py-2 space-y-1"><input form="task-table-filter" type="search" name="search" maxLength={100} defaultValue={searchFilter ?? ''} placeholder="Cari judul" aria-label="Cari judul tugas" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs font-normal" />{user.roleLevel>=3&&<select form="task-table-filter" name="section" defaultValue={sectionFilter ?? ''} aria-label="Filter seksi" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs font-normal"><option value="">Semua seksi</option>{filterOptions.sections.map(section=><option key={section.id} value={section.id}>{section.name}</option>)}</select>}</th>
                <th className="px-3 py-2">{user.roleLevel>=3?<select form="task-table-filter" name="owner" defaultValue={ownerFilter ?? ''} aria-label="Filter PIC" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs font-normal"><option value="">Semua PIC</option>{filterOptions.owners.map(owner=><option key={owner.id} value={owner.id}>{owner.name}</option>)}</select>:<span className="text-[10px] font-normal text-slate-400">Akun saya</span>}</th>
                <th className="px-3 py-2 text-[10px] font-normal text-slate-400">Tanggal lengkap</th>
                <th className="px-3 py-2"><select form="task-table-filter" name="priority" defaultValue={priorityFilter ?? ''} aria-label="Filter prioritas" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs font-normal"><option value="">Semua</option><option value="rendah">Rendah</option><option value="sedang">Sedang</option><option value="tinggi">Tinggi</option></select></th>
                <th className="px-3 py-2 text-[10px] font-normal text-slate-400">0–100%</th>
                <th className="px-3 py-2"><select form="task-table-filter" name="status" defaultValue={statusFilter ?? ''} aria-label="Filter status" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs font-normal">{STATUS_OPTIONS.map(opt=><option key={opt.value} value={opt.value}>{opt.label}</option>)}</select><div className="mt-1 flex gap-1"><button form="task-table-filter" className="rounded bg-red-600 px-2 py-1 text-[10px] font-semibold text-white">Terapkan</button><Link href={isMine?"/tasks?mine=1":"/tasks"} className="rounded border border-slate-300 px-2 py-1 text-[10px] font-normal text-slate-600">Reset</Link></div></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {tasks.map((task) => (
                <tr key={task.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 px-4 whitespace-nowrap text-slate-600">{formatDate(task.createdAt)}</td>
                  <td className="py-3.5 px-4 whitespace-nowrap max-w-xs">
                    <Link
                      href={`/tasks/${task.id}`}
                      className="font-semibold text-slate-800 hover:text-[var(--color-brand)] transition-colors block truncate"
                      title={task.title}
                    >
                      {task.title}
                    </Link>
                    <p className="text-slate-400 text-[10px] mt-0.5">{task.orgUnitName}</p>
                  </td>
                  <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                    {task.ownerName}
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <span
                      className={task.isOverdue ? 'text-red-600 font-medium' : 'text-slate-600'}
                    >
                      {formatDate(task.dueDate)}
                    </span>
                    {task.isOverdue && (
                      <span className="ml-1 text-[10px] font-semibold text-red-500">(Lewat)</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <PriorityBadge priority={task.priority} />
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <ProgressBar value={task.progressPct} />
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <StatusBadge status={task.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {/* Paginasi */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/40">
              <p className="text-xs text-slate-500">
                Halaman {page} dari {totalPages} ({total} tugas)
              </p>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={buildHref({ page: String(page - 1) })}
                    className="px-3 py-1.5 text-xs border border-slate-200 rounded bg-white hover:bg-slate-50 transition"
                  >
                    ← Sebelumnya
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={buildHref({ page: String(page + 1) })}
                    className="px-3 py-1.5 text-xs border border-slate-200 rounded bg-white hover:bg-slate-50 transition"
                  >
                    Berikutnya →
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
