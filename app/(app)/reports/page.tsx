import { taskStatusLabel } from '@/lib/tasks/status-labels'
import { getTaskFilterOptions, getTaskList } from '@/lib/tasks/queries'
import WorkspaceTabs, { REPORT_TABS } from '../_components/WorkspaceTabs'
import type { Metadata } from 'next'
import { getSessionUser, requireRole } from '@/lib/auth/session'
import { parseReportFilters } from '@/lib/reports/queries'

export const metadata: Metadata = { title: 'Laporan' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function singleParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) throw new Error('Parameter filter laporan tidak valid.')
  return value
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value))
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-xs font-medium text-slate-500">{label}</h2>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </article>
  )
}

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const [user, params] = await Promise.all([getSessionUser(), searchParams])
  requireRole(user, 'Staff/PIC')
  const selectedMonthRaw = singleParam(params.month)
  const selectedMonth = selectedMonthRaw && /^\d{4}-(0[1-9]|1[0-2])$/.test(selectedMonthRaw) ? selectedMonthRaw : null
  const selectedFrom = selectedMonth ? `${selectedMonth}-01` : null
  const selectedTo = selectedMonth
    ? new Date(Date.UTC(Number(selectedMonth.slice(0,4)), Number(selectedMonth.slice(5,7)), 0)).toISOString().slice(0,10)
    : null
  const filters = parseReportFilters({
    dateFrom: selectedFrom,
    dateTo: selectedTo,
    orgUnitId: singleParam(params.orgUnit),
  })
  const page = Math.max(1, Math.min(100000, Number(singleParam(params.page) ?? '1') || 1))
  const [tasks,options] = await Promise.all([
    getTaskList(user,{createdFrom:selectedFrom||null,createdTo:selectedTo||null,orgUnitId:filters.orgUnitId,ownerId:user.roleLevel === 2 ? user.id : undefined,page,pageSize:50}),
    getTaskFilterOptions(user),
  ])

  // Buat query string untuk tombol export (FR-091)
  const exportQs = new URLSearchParams({
    ...(selectedMonth ? {month:selectedMonth} : {}),
    ...(filters.orgUnitId !== null ? { orgUnit: String(filters.orgUnitId) } : {}),
  }).toString()

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceTabs current="/reports" tabs={REPORT_TABS} roleLevel={user.roleLevel} />
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">LAPORAN TUGAS</h1>
        </div>
        {/* Tombol Export — FR-091 */}
        <div className="flex shrink-0 gap-2">
          <a
            id="btn-export-xlsx"
            href={`/api/reports/export?format=xlsx&${exportQs}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            <svg className="h-3.5 w-3.5 text-green-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 12v6m0 0l-3-3m3 3l3-3M4 8l8-8 8 8" />
            </svg>
            Excel (.xlsx)
          </a>
          <a
            id="btn-export-pdf"
            href={`/api/reports/export?format=pdf&${exportQs}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            <svg className="h-3.5 w-3.5 text-red-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            PDF
          </a>
        </div>
      </header>

      <section aria-label="Daftar detail tugas" className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <form id="report-table-filter" method="get" action="/reports" />
        <h2 className="border-b border-slate-200 px-4 py-4 text-base font-semibold text-slate-900">Daftar Rincian Tugas</h2>
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr><th className="px-4 py-3">Tanggal</th><th className="px-4 py-3">Tugas</th><th className="px-4 py-3">Penanggung jawab</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Kemajuan</th><th className="px-4 py-3">Tenggat</th><th className="px-4 py-3">Detail</th></tr>
            <tr className="border-t border-slate-200 bg-white align-top">
              <th className="px-3 py-2"><input form="report-table-filter" type="month" name="month" defaultValue={selectedMonth ?? ''} aria-label="Filter bulan dan tahun" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs font-normal" /></th>
              <th className="px-3 py-2 text-[10px] font-normal text-slate-400">Semua tugas</th>
              <th className="px-3 py-2 text-[10px] font-normal text-slate-400">Sesuai cakupan</th>
              <th className="px-3 py-2 text-[10px] font-normal text-slate-400">Semua status</th>
              <th className="px-3 py-2 text-[10px] font-normal text-slate-400">0–100%</th>
              <th className="px-3 py-2">{user.roleLevel>2?<select form="report-table-filter" name="orgUnit" defaultValue={filters.orgUnitId?.toString() ?? ''} aria-label="Filter seksi" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs font-normal"><option value="">Semua seksi</option>{options.sections.map(orgUnit=><option key={orgUnit.id} value={orgUnit.id}>{orgUnit.name}</option>)}</select>:<span className="text-[10px] font-normal text-slate-400">Tanggal lengkap</span>}</th>
              <th className="px-3 py-2"><div className="flex gap-1"><button form="report-table-filter" className="rounded bg-red-600 px-2 py-1 text-[10px] font-semibold text-white">Terapkan</button><a href="/reports" className="rounded border border-slate-300 px-2 py-1 text-[10px] font-normal text-slate-600">Reset</a></div></th>
            </tr>
          </thead>
          <tbody>
            {tasks.items.map(task=><tr key={task.id} className="border-t border-slate-100">
              <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(task.createdAt)}</td><td className="px-4 py-3 font-medium">{task.title}</td>
              <td className="px-4 py-3">{task.ownerName}</td>
              <td className="px-4 py-3">{taskStatusLabel(task.status)}</td>
              <td className="px-4 py-3">{task.progressPct}%</td>
              <td className="px-4 py-3">{formatDate(task.dueDate)}</td>
              <td className="px-4 py-3"><a className="font-semibold text-red-700 hover:underline" href={`/tasks/${task.id}`}>Lihat progres & lampiran</a></td>
            </tr>)}
            {tasks.items.length===0&&<tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Tidak ada tugas dalam periode yang dipilih.</td></tr>}
          </tbody>
        </table>
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm">
          <span>Halaman {page} · {tasks.total} tugas</span>
          <div className="flex gap-3">
            {page>1&&<a className="font-semibold text-red-700" href={`/reports?${new URLSearchParams({...Object.fromEntries(new URLSearchParams(exportQs)),page:String(page-1)})}`}>Sebelumnya</a>}
            {page*50<tasks.total&&<a className="font-semibold text-red-700" href={`/reports?${new URLSearchParams({...Object.fromEntries(new URLSearchParams(exportQs)),page:String(page+1)})}`}>Berikutnya</a>}
          </div>
        </div>
      </section>
    </div>
  )
}
