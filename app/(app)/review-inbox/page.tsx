import type { Metadata } from 'next'
import Link from 'next/link'
import { getSessionUser, requireRole } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { getReviewInboxFilter } from '@/lib/tasks/review-permissions'
import WorkspaceTabs, { APPROVAL_TABS } from '../_components/WorkspaceTabs'

export const metadata: Metadata = { title: 'Inbox Review Task' }

/** Review inbox scoped by the authenticated user, not a generic task list.
 * The existing review detail endpoint re-checks permissions for every action. */
type SearchParams = { month?: string; search?: string }

function formatDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}

export default async function ReviewInboxPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [user, params] = await Promise.all([getSessionUser(), searchParams])
  const month = params.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : null
  const search = typeof params.search === 'string' ? params.search.trim().slice(0, 100) : ''
  requireRole(user, 'Manager')

  const supabase = await createClient()
  // Query all assigned reviews in bounded batches rather than hiding
  // the 101st pending task. Each request still uses the authenticated RLS scope.
  const tasks: Array<{id:string;title:string;created_at:string;due_date:string;progress_pct:number}> = []
  const pageSize = 200
  for (let offset=0;offset<10000;offset+=pageSize) {
    let query = supabase.from('tasks')
      .select('id,title,created_at,due_date,progress_pct')
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
    const reviewFilter = getReviewInboxFilter(user)
    if (reviewFilter?.startsWith('reviewer_id.eq.') && !reviewFilter.includes(',')) {
      query = query.eq('reviewer_id', user.id)
    } else if (reviewFilter) {
      query = query.or(reviewFilter)
    }
    const {data,error}=await query
    if (error || !data) throw new Error('Daftar review task gagal dimuat.')
    tasks.push(...data)
    if (data.length<pageSize) break
    if (offset+pageSize>=10000) throw new Error('Terlalu banyak review; hubungi administrator untuk pengarsipan.')
  }

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-5 sm:px-6 lg:px-8">
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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <tr><th className="px-4 py-3">TANGGAL</th><th className="px-4 py-3">TUGAS</th><th className="px-4 py-3">KEMAJUAN</th><th className="px-4 py-3">TENGGAT</th><th className="px-4 py-3">AKSI</th></tr>
              <tr className="border-t border-slate-200 bg-white align-top">
                <th className="px-3 py-2"><input form="review-table-filter" type="month" name="month" defaultValue={month ?? ''} aria-label="Filter bulan dan tahun" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs" /></th>
                <th className="px-3 py-2"><input form="review-table-filter" type="search" name="search" defaultValue={search} placeholder="Cari tugas" aria-label="Cari tugas" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs" /></th>
                <th className="px-3 py-2 text-[10px] font-normal text-slate-400">0–100%</th>
                <th className="px-3 py-2 text-[10px] font-normal text-slate-400">Tanggal lengkap</th>
                <th className="px-3 py-2"><div className="flex gap-1"><button form="review-table-filter" className="rounded bg-red-600 px-2 py-1 text-[10px] font-semibold text-white">Terapkan</button><Link href="/review-inbox" className="rounded border border-slate-300 px-2 py-1 text-[10px] text-slate-600">Reset</Link></div></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tasks.map(task=><tr key={task.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(task.created_at)}</td>
                <td className="px-4 py-3 font-semibold text-slate-900">{task.title}</td>
                <td className="px-4 py-3 text-slate-600">{task.progress_pct}%</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(task.due_date)}</td>
                <td className="px-4 py-3"><Link href={`/tasks/${task.id}/review`} className="rounded-lg bg-[var(--color-brand)] px-3 py-2 text-xs font-semibold text-white">Buka Review</Link></td>
              </tr>)}
              {tasks.length===0&&<tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-slate-500">Tidak ada task review yang sesuai filter.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
