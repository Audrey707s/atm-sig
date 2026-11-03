import WorkspaceTabs, { DASHBOARD_TABS } from '../_components/WorkspaceTabs'
// FR-070 — Halaman Dashboard ATM
// Sesuai Stitch mockup 04_dashboard: metric cards + tabel task perlu perhatian

import type { Metadata } from 'next'
import { getSessionUser } from '@/lib/auth/session'
import {
  getDashboardMetrics,
  getDashboardPerformance,
  getTasksPerluPerhatian,
} from '@/lib/dashboard/queries'
import { StatusBadge, ProgressBar, TimeProgress } from '../_components/ui/Badges'
import Link from 'next/link'
import PerformanceOverview from '../_components/PerformanceOverview'
import { resolveDashboardMonth } from '@/lib/dashboard/month'

export const metadata: Metadata = { title: 'Dashboard' }

function MetricCard({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color?: string
}) {
  return (
    <div className="atm-interactive atm-appear bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
      <p className="text-xs text-slate-500 font-medium mb-1">{label}</p>
      <p
        className="atm-metric-value text-3xl font-bold tabular-nums"
        style={{ color: color ?? 'var(--color-text-primary)', '--atm-metric-dark': ({ '#ea580c': '#e8cda7', '#dc2626': '#dfafbb', '#7c3aed': '#c7b3da', '#2563eb': '#a6c3df' } as Record<string, string>)[color ?? ''] ?? '#e7eaf0' } as React.CSSProperties}
      >
        {value}
      </p>
    </div>
  )
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(iso))
}

export default async function DashboardPage({ searchParams }: {searchParams:Promise<{month?:string}>}) {
  const [user,params] = await Promise.all([getSessionUser(),searchParams])
  const month=resolveDashboardMonth(params.month)
  const [year,monthNumber]=month.split('-').map(Number)
  const nextMonth=monthNumber===12 ? `${year+1}-01` : `${year}-${String(monthNumber+1).padStart(2,'0')}`
  const from=`${month}-01T00:00:00+07:00`,toExclusive=`${nextMonth}-01T00:00:00+07:00`
  const isPic = user.roleLevel === 2
  const [metrics, tasksPerhatian, performance] = await Promise.all([
    getDashboardMetrics(user,from,toExclusive),
    getTasksPerluPerhatian(user,10,from,toExclusive),
    isPic ? Promise.resolve(null) : getDashboardPerformance(user,new Date(),from,toExclusive),
  ])

  const showAlert =
    metrics.tertinggal > 0 || metrics.blocked > 0

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8">
      <WorkspaceTabs current="/dashboard" tabs={DASHBOARD_TABS} roleLevel={user.roleLevel} />
      {/* Judul halaman + filter periode */}
      <section className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 uppercase sm:text-3xl">
          Dashboard
        </h1>
        <form method="get" action="/dashboard" className="flex flex-wrap items-center gap-3 sm:ml-auto sm:justify-end">
          <input type="month" name="month" defaultValue={month} aria-label="Periode bulan dan tahun" className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2" />
          <button className="rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white">Terapkan</button>
        </form>
      </section>

      {/* Banner peringatan */}
      {showAlert && (
        <section className="mb-6">
          <div
            className="atm-notice rounded-lg px-4 py-3 flex items-center gap-3 shadow-sm"
            style={{ backgroundColor: '#fef9c3', border: '1px solid #fde047' }}
            role="alert"
          >
            <div
              className="w-5 h-5 rounded-full text-white flex items-center justify-center shrink-0"
              style={{ backgroundColor: '#eab308' }}
            >
              <span className="text-xs font-bold leading-none">!</span>
            </div>
            <p className="text-xs font-medium leading-relaxed" style={{ color: '#854d0e' }}>
              {metrics.tertinggal > 0 && (
                <>{metrics.tertinggal} task melewati checkpoint dengan progress tertinggal. </>
              )}
              {metrics.blocked > 0 && (
                <>{metrics.blocked} task dalam status Blocked dan memerlukan bantuan.</>
              )}
            </p>
          </div>
        </section>
      )}

      {/* Metric cards */}
      <section
        className={`grid grid-cols-1 min-[400px]:grid-cols-2 ${isPic ? 'lg:grid-cols-3' : 'xl:grid-cols-5'} gap-3 sm:gap-4 mb-7`}
        aria-label="Ringkasan metrics"
      >
        <MetricCard label={isPic ? 'Total Ditugaskan' : 'Total Task'} value={metrics.totalTask} />
        {isPic ? <>
          <MetricCard label="Selesai" value={metrics.completed} color="#2563eb" />
          <MetricCard label="Pending" value={metrics.pending} color="#ea580c" />
        </> : <>
          <MetricCard label="Tertinggal" value={metrics.tertinggal} color="#ea580c" />
          <MetricCard label="Blocked" value={metrics.blocked} color="#dc2626" />
          <MetricCard label="Menunggu Review" value={metrics.menuungguReview} color="#7c3aed" />
          <MetricCard label="Pengajuan Deadline" value={metrics.pengajuanDeadline} color="#2563eb" />
        </>}
      </section>

      {isPic ? (
        <section className="mb-7 rounded-lg border border-slate-200 bg-white p-5 shadow-sm" aria-label="Progress penyelesaian task pribadi">
          <div className="mb-2 flex items-center justify-between text-sm">
            <h2 className="font-semibold text-slate-800">Progress Penyelesaian Saya</h2>
            <span className="font-bold text-[var(--color-brand)]">{metrics.totalTask ? Math.round(metrics.completed / metrics.totalTask * 100) : 0}%</span>
          </div>
          <ProgressBar value={metrics.totalTask ? Math.round(metrics.completed / metrics.totalTask * 100) : 0} />
        </section>
      ) : performance ? <div className="mb-7"><PerformanceOverview performance={performance} /></div> : null}

      {/* Tabel task perlu perhatian */}
      <section aria-label="Task perlu perhatian">
        <h2 className="text-sm font-bold text-slate-800 mb-3 tracking-normal">
          Task Perlu Perhatian
        </h2>

        {tasksPerhatian.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg p-12 text-center shadow-sm">
            <p className="text-sm text-slate-400">
              Tidak ada task yang memerlukan perhatian saat ini.
            </p>
          </div>
        ) : (
          <div className="atm-appear bg-white border border-slate-200 rounded-lg overflow-x-auto shadow-sm">
            <table className="w-full min-w-[690px] text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-400 tracking-wider">
                  <th className="py-3 px-4 font-semibold" scope="col">TASK</th>
                  <th className="py-3 px-4 font-semibold" scope="col">PIC</th>
                  <th className="py-3 px-4 font-semibold" scope="col">TENGGAT</th>
                  <th className="py-3 px-4 font-semibold" scope="col">WAKTU BERJALAN</th>
                  <th className="py-3 px-4 font-semibold" scope="col">PROGRESS</th>
                  <th className="py-3 px-4 font-semibold" scope="col">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {tasksPerhatian.map((task) => (
                  <tr key={task.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-slate-800 whitespace-nowrap">
                      <Link
                        href={`/tasks/${task.id}`}
                        className="hover:text-[var(--color-brand)] transition-colors"
                      >
                        {task.title}
                      </Link>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                      {task.ownerName}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                      {formatDate(task.dueDate)}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <TimeProgress
                        timePct={task.timePct}
                        isOverdue={task.isOverdue}
                      />
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
        )}

        {tasksPerhatian.length > 0 && (
          <div className="mt-3 text-right">
            <Link
              href="/tasks"
              className="text-xs text-[var(--color-brand)] hover:underline font-medium"
            >
              Lihat semua task →
            </Link>
          </div>
        )}
      </section>
    </div>
  )
}
