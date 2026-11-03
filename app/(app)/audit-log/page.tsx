import WorkspaceTabs, { REPORT_TABS } from '../_components/WorkspaceTabs'
// T-504 — Tampilan Audit Log — FR-092
// Hanya role Manager+ yang dapat mengakses halaman ini.
// Data read-only: tidak ada tombol ubah/hapus.

import type { Metadata } from 'next'
import { getSessionUser, requireRole } from '@/lib/auth/session'
import { getAuditLogs, parseAuditFilters, KNOWN_AUDIT_ACTIONS } from '@/lib/audit/queries'
import Link from 'next/link'
import { auditValueSummary } from '@/lib/audit/format'

export const metadata: Metadata = { title: 'Audit Log' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function singleParam(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0]
  return v
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(iso))
}

function ActionBadge({ action }: { action: string }) {
  const colorMap: Record<string, string> = {
    'assign-role':              'bg-blue-50 text-blue-700 ring-blue-600/15',
    'propose-role':             'bg-violet-50 text-violet-700 ring-violet-600/15',
    'approve-role-proposal':    'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
    'reject-role-proposal':     'bg-rose-50 text-rose-700 ring-rose-600/15',
    update_deadline_direct:    'bg-amber-100 text-amber-700',
    create:                    'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
    update:                    'bg-sky-50 text-sky-700 ring-sky-600/15',
    delete:                    'bg-rose-50 text-rose-700 ring-rose-600/15',
    update_status:             'bg-indigo-50 text-indigo-700 ring-indigo-600/15',
    review_task:               'bg-violet-50 text-violet-700 ring-violet-600/15',
  }
  const cls = colorMap[action] ?? 'bg-slate-100 text-slate-600'
  const label = AUDIT_ACTION_LABELS[action] ?? action
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${cls}`}>
      {label}
    </span>
  )
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  invite: 'Undang pengguna',
  'update-name': 'Ubah nama',
  activate: 'Aktifkan pengguna',
  deactivate: 'Nonaktifkan pengguna',
  'assign-role': 'Tetapkan role',
  'propose-role': 'Usulkan perubahan role',
  'approve-role-proposal': 'Setujui perubahan role',
  'reject-role-proposal': 'Tolak perubahan role',
  create: 'Buat task',
  update: 'Ubah task',
  delete: 'Hapus task',
  update_status: 'Ubah status',
  review_task: 'Review task',
  approve_deadline: 'Setujui perubahan tenggat',
  reject_deadline: 'Tolak perubahan tenggat',
  update_deadline_direct: 'Ubah tenggat langsung',
  update_start_date_direct: 'Ubah tanggal mulai langsung',
  task_categories_insert: 'Tambah kategori',
  task_categories_update: 'Ubah kategori',
  task_categories_delete: 'Hapus kategori',
  task_templates_insert: 'Tambah template',
  task_templates_update: 'Ubah template',
  task_templates_delete: 'Hapus template',
}

export default async function AuditLogPage({ searchParams }: { searchParams: SearchParams }) {
  const [user, params] = await Promise.all([getSessionUser(), searchParams])
  requireRole(user, 'Manager')

  const selectedMonthRaw = singleParam(params.month)
  const selectedMonth = selectedMonthRaw && /^\d{4}-(0[1-9]|1[0-2])$/.test(selectedMonthRaw) ? selectedMonthRaw : null
  const selectedFrom = selectedMonth ? `${selectedMonth}-01` : undefined
  const selectedTo = selectedMonth
    ? new Date(Date.UTC(Number(selectedMonth.slice(0,4)), Number(selectedMonth.slice(5,7)), 0)).toISOString().slice(0,10)
    : undefined
  const filters = parseAuditFilters({
    action: singleParam(params.action),
    object: singleParam(params.object),
    from: selectedFrom,
    to: selectedTo,
    page: singleParam(params.page),
  })

  const { entries, hasMore } = await getAuditLogs(user, filters)

  // Build base query string for pagination links
  const baseQs = new URLSearchParams({
    ...(filters.action       ? { action: filters.action }             : {}),
    ...(filters.objectPrefix ? { object: filters.objectPrefix }       : {}),
    ...(selectedMonth ? { month: selectedMonth } : {}),
  })
  const prevQs = new URLSearchParams(baseQs)
  prevQs.set('page', String(filters.page - 1))
  const nextQs = new URLSearchParams(baseQs)
  nextQs.set('page', String(filters.page + 1))

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceTabs current="/audit-log" tabs={REPORT_TABS} />
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Catatan Audit</h1>
      </header>

      {/* Results */}
      {entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-14 text-center shadow-sm">
          <span aria-hidden="true" className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-xl text-slate-500">⌕</span>
          <h2 className="mt-4 text-sm font-semibold text-slate-900">Belum ada catatan yang cocok</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Coba ubah aksi, objek, atau periode untuk melihat catatan lainnya.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Riwayat perubahan</h2>
              <p className="mt-0.5 text-xs text-slate-500">Urutan terbaru · {entries.length} catatan di halaman ini</p>
            </div>
            <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">Halaman {filters.page}</span>
          </div>
          <form id="audit-table-filter" method="get" action="/audit-log" />
          <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm" aria-label="Tabel audit log">
            <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3 w-40">Waktu</th>
                <th scope="col" className="px-4 py-3 w-40">Aksi</th>
                <th scope="col" className="px-4 py-3">Objek</th>
                <th scope="col" className="px-4 py-3 w-36">Pengguna</th>
                <th scope="col" className="px-4 py-3">Nilai Lama</th>
                <th scope="col" className="px-4 py-3">Nilai Baru</th>
              </tr>
              <tr className="border-t border-slate-200 bg-white align-top normal-case tracking-normal">
                <th className="px-3 py-2"><input form="audit-table-filter" type="month" name="month" defaultValue={selectedMonth ?? ''} aria-label="Filter bulan dan tahun" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs font-normal" /></th>
                <th className="px-3 py-2"><select form="audit-table-filter" name="action" defaultValue={filters.action ?? ''} aria-label="Filter aksi" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs font-normal"><option value="">Semua aksi</option>{KNOWN_AUDIT_ACTIONS.map(action=><option key={action} value={action}>{AUDIT_ACTION_LABELS[action] ?? action}</option>)}</select></th>
                <th className="px-3 py-2"><input form="audit-table-filter" name="object" defaultValue={filters.objectPrefix ?? ''} placeholder="Cari objek" aria-label="Filter objek" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs font-normal" /></th>
                <th className="px-3 py-2 text-[10px] font-normal text-slate-400">Sesuai pengguna</th>
                <th className="px-3 py-2 text-[10px] font-normal text-slate-400">Perubahan awal</th>
                <th className="px-3 py-2"><div className="flex gap-1"><button form="audit-table-filter" className="rounded bg-red-600 px-2 py-1 text-[10px] font-semibold text-white">Terapkan</button><Link href="/audit-log" className="rounded border border-slate-300 px-2 py-1 text-[10px] font-normal text-slate-600">Reset</Link></div></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((entry) => (
                <tr key={entry.id} className="transition-colors hover:bg-slate-50/80">
                  <td className="px-4 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                    {formatDateTime(entry.createdAt)}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <ActionBadge action={entry.action} />
                  </td>
                  <td className="px-4 py-3.5 font-mono text-xs text-slate-700 break-words">
                    {entry.object}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-slate-700 whitespace-nowrap">
                    {entry.userName ?? <span className="text-slate-400 italic">—</span>}
                  </td>
                  <td className="max-w-[240px] px-4 py-3.5 text-xs leading-5 text-slate-600 break-all">
                    <ul className="space-y-1 break-words">{auditValueSummary(entry.oldValue,entry.newValue).map((line,i)=><li key={i}>{line}</li>)}</ul>
                  </td>
                  <td className="max-w-[240px] px-4 py-3.5 text-xs leading-5 text-slate-600 break-all">
                    <ul className="space-y-1 break-words">{auditValueSummary(entry.newValue,entry.oldValue).map((line,i)=><li key={i}>{line}</li>)}</ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {(filters.page > 1 || hasMore) && (
        <nav
          aria-label="Navigasi halaman audit log"
          className="flex items-center justify-between text-sm"
        >
          {filters.page > 1 ? (
            <Link
              id="audit-prev-page"
              href={`/audit-log?${prevQs.toString()}`}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50"
            >
              ← Sebelumnya
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-slate-500">Halaman {filters.page}</span>
          {hasMore ? (
            <Link
              id="audit-next-page"
              href={`/audit-log?${nextQs.toString()}`}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50"
            >
              Berikutnya →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}

      <p className="text-xs text-slate-400">
        Entri ditampilkan dalam urutan terbaru terlebih dahulu. Halaman {filters.page} · {entries.length} entri.
        Catatan audit hanya dapat dibaca.
      </p>
    </div>
  )
}
