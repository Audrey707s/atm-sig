import type { Metadata } from 'next'
import { getSessionUser, requireRole } from '@/lib/auth/session'
import { getPeriodWorkloads } from '@/lib/dashboard/period-workload'
import WorkspaceTabs, { DASHBOARD_TABS } from '../_components/WorkspaceTabs'
import CountUp from '@/app/_components/CountUp'

export const metadata: Metadata = { title: 'Beban Kerja Periode' }

type Params = Promise<{ month?: string }>
export default async function JobloadPage({ searchParams }: { searchParams: Params }) {
  const [user,params]=await Promise.all([getSessionUser(),searchParams])
  requireRole(user,'Manager')
  const parts = new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',timeZone:'Asia/Jakarta'}).formatToParts(new Date())
  const defaultMonth = (parts.find(p=>p.type==='year')?.value??'2026') + '-' + (parts.find(p=>p.type==='month')?.value??'01')
  const month= params.month && /^(19|20)\d\d-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : defaultMonth
  const [year,mon]=month.split('-').map(Number)
  const nextMonth=mon===12 ? `${year+1}-01` : `${year}-${String(mon+1).padStart(2,'0')}`
  const workload=await getPeriodWorkloads(user,`${month}-01T00:00:00+07:00`,`${nextMonth}-01T00:00:00+07:00`)
  const total=workload.rows.reduce((sum,row)=>sum+row.total,0)
  return (
    <main className="mx-auto w-full max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceTabs current="/jobload" tabs={DASHBOARD_TABS} roleLevel={user.roleLevel} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-xl font-bold text-[var(--color-text-primary)]">Beban Kerja per Periode</h1></div>
        <form method="get" action="/jobload" className="flex items-end gap-2"><input type="month" name="month" defaultValue={month} aria-label="Periode bulan dan tahun" className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2" /><button className="rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white">Terapkan</button></form>
      </div>
      <div className="atm-card atm-spotlight atm-interactive w-full max-w-60 p-4 sm:p-5" aria-label={`Total penugasan: ${total}`}>
        <p className="atm-eyebrow">Total Penugasan</p>
        <p className="mt-3 text-4xl font-medium tabular-nums tracking-[-0.05em] text-[var(--color-text-primary)]">
          <CountUp value={total} />
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]">
        <table className="atm-jobload-table w-full min-w-[900px] table-fixed text-sm">
          <thead className="text-[var(--color-text-secondary)]">
            <tr>
              {['PIC','Total Job','Carry-over','Baru','Selesai','Belum Selesai','Overdue','Completion Rate'].map((label,index)=>
                <th key={label} className={`px-4 py-3.5 ${index === 0 ? 'text-left' : 'text-center'}`}>{label}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {workload.rows.map(row=>
              <tr key={row.ownerId} className="text-[var(--color-text-primary)]">
                <td className="px-4 py-3.5 text-left font-semibold">{row.ownerName}</td>
                {[row.total,row.carryOver,row.newTasks,row.completed,row.outstanding,row.overdue].map((n,i)=>
                  <td key={i} className="px-4 py-3.5 text-center tabular-nums">{n}</td>
                )}
                <td className="px-4 py-3.5 text-center tabular-nums">{row.completionRate}%</td>
              </tr>
            )}
            {!workload.rows.length&&<tr><td colSpan={8} className="px-4 py-10 text-center text-[var(--color-text-muted)]">Tidak ada pekerjaan dalam periode ini.</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  )
}
