import type { Metadata } from 'next'
import Link from 'next/link'
import { getSessionUser, requireRole } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { getReviewInboxFilter } from '@/lib/tasks/review-permissions'
import { getTaskFilterOptions } from '@/lib/tasks/queries'
import WorkspaceTabs, { APPROVAL_TABS } from '../_components/WorkspaceTabs'

export const metadata: Metadata = { title: 'Inbox Review Task' }

/** Review inbox scoped by the authenticated user, not a generic task list.
 * The existing review detail endpoint re-checks permissions for every action. */
type SearchParams = { month?: string; search?: string; section?: string }

function formatDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}

export default async function ReviewInboxPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [user, params] = await Promise.all([getSessionUser(), searchParams])
  const month = params.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : null
  const search = typeof params.search === 'string' ? params.search.trim().slice(0, 100) : ''
  const section = params.section && /^\d+$/.test(params.section) ? Number(params.section) : null
  requireRole(user, 'Manager')

  const [supabase, filterOptions] = await Promise.all([createClient(), getTaskFilterOptions(user)])
  // Query all assigned reviews in bounded batches rather than hiding
  // the 101st pending task. Each request still uses the authenticated RLS scope.
  const tasks: Array<{id:string;title:string;created_at:string;due_date:string;progress_pct:number;orgUnitName:string}> = []
  const pageSize = 200
  for (let offset=0;offset<10000;offset+=pageSize) {
    let query = supabase.from('tasks')
      .select('id,title,created_at,due_date,progress_pct,org_unit_id,org_unit:org_units!tasks_org_unit_id_fkey(name)')
      .eq('status','Review')
      .order('due_date',{ascending:true})
      .order('id',{ascending:true})
      .range(offset,offset+pageSize-1)
    if (month) {
      const [year, monthNumber] = month.split('-').map(Number)
      const nextMonth = monthNumber === 12 ? `${year + 1}-01` : `${year}-${String(monthNumber + 1).padStart(2, '0')}`
      query = query.gte('created_at', `${month}-01T00:00:00+07:00`).lt('created_at', `${nextMonth}-01T00:00:00+07:00`)
    }
    if (search) query = query.ilike('title', `%${search}%`)
    if (section) query = query.eq('org_unit_id', section)
    const reviewFilter = getReviewInboxFilter(user)
    if (reviewFilter?.startsWith('reviewer_id.eq.') && !reviewFilter.includes(',')) {
      query = query.eq('reviewer_id', user.id)
    } else if (reviewFilter) {
      query = query.or(reviewFilter)
    }
    const {data,error}=await query
    if (error || !data) throw new Error('Daftar review task gagal dimuat.')
    tasks.push(...data.map(row=>({
      id:row.id,
      title:row.title,
      created_at:row.created_at,
      due_date:row.due_date,
      progress_pct:row.progress_pct,
      orgUnitName:(row.org_unit as {name:string}|null)?.name ?? '—',
    })))
    if (data.length<pageSize) break
    if (offset+pageSize>=10000) throw new Error('Terlalu banyak review; hubungi administrator untuk pengarsipan.')
  }

  return (
    <main className="mx-auto w-full max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceTabs current="/review-inbox" tabs={APPROVAL_TABS} roleLevel={user.roleLevel} />
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Review Task</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          {user.roleLevel >= 5
            ? 'Semua task berstatus Review ditampilkan untuk pengawasan dan keputusan GM/Super Admin.'
            : 'Task berstatus Review yang menunggu keputusan Anda. Hanya reviewer yang ditetapkan dapat memutuskan.'}
        </p>
      </header>
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" aria-label="Daftar tinjauan tugas">
        <form id="review-table-filter" action="/review-inbox" method="get" />
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold text-slate-900">Daftar Tinjauan Tugas</h2>
          <div className="flex items-center gap-2">
            <button form="review-table-filter" type="submit" className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">Terapkan</button>
            <Link href="/review-inbox" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">Reset</Link>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <tr><th className="px-4 py-3">TANGGAL</th><th className="px-4 py-3">TUGAS</th><th className="px-4 py-3">SEKSI</th><th className="px-4 py-3">KEMAJUAN</th><th className="px-4 py-3">TENGGAT</th><th className="px-4 py-3">AKSI</th></tr>
              <tr className="border-t border-slate-200 bg-white align-top">
                <th className="px-3 py-2"><input form="review-table-filter" type="month" name="month" defaultValue={month ?? ''} aria-label="Filter bulan dan tahun" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs" /></th>
                <th className="px-3 py-2"><input form="review-table-filter" type="search" name="search" defaultValue={search} placeholder="Cari tugas" aria-label="Cari tugas" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs" /></th>
                <th className="px-3 py-2"><select form="review-table-filter" name="section" defaultValue={section ?? ''} aria-label="Filter seksi" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"><option value="">Semua seksi</option>{filterOptions.sections.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></th>
                <th className="px-3 py-2 text-[10px] font-normal text-slate-400">0–100%</th>
                <th className="px-3 py-2 text-[10px] font-normal text-slate-400">Tanggal lengkap</th>
                <th className="px-3 py-2 text-[10px] font-normal text-slate-400">Buka detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tasks.map(task=><tr key={task.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(task.created_at)}</td>
                <td className="px-4 py-3 font-semibold text-slate-900">{task.title}</td>
                <td className="px-4 py-3 text-slate-600">{task.orgUnitName}</td>
                <td className="px-4 py-3 text-slate-600">{task.progress_pct}%</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(task.due_date)}</td>
                <td className="px-4 py-3"><Link href={`/tasks/${task.id}/review`} className="rounded-lg bg-[var(--color-brand)] px-3 py-2 text-xs font-semibold text-white">Buka Review</Link></td>
              </tr>)}
              {tasks.length===0&&<tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-500">Tidak ada task review yang sesuai filter.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
