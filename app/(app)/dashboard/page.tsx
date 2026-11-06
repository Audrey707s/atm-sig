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
import CountUp from '@/app/_components/CountUp'
import DashboardWelcome from './DashboardWelcome'

export const metadata: Metadata = { title: 'Dashboard' }

type MetricTone = 'blocked' | 'revisi' | 'review' | 'progress' | 'done'

function MetricCard({
  label,
  value,
  tone,
  href,
  active = false,
}: {
  label: string
  value: number
  tone?: MetricTone
  href?: string
  active?: boolean
}) {
  return (
    <div className={`atm-card relative atm-spotlight atm-interactive p-4 sm:p-5 ${active ? "!bg-[#ffe0dc] !border-[#eb8790] text-slate-900" : ""}`}>
      {href ? <Link href={href} className="absolute inset-0 z-10 rounded-xl" aria-label={`Filter ${label}`} aria-current={active ? "true" : undefined} /> : null}
      <div className="flex items-center justify-between gap-2">
        <p className="atm-eyebrow">{label}</p>
        {tone && (
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: `var(--st-${tone}-dot)` }}
          />
        )}
      </div>
      <p className="mt-3 text-4xl font-medium tabular-nums tracking-[-0.05em] text-[var(--color-text-primary)]">
        <CountUp value={value} />
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

export default async function DashboardPage({ searchParams }: {searchParams:Promise<{month?:string; attention?:string; card?:string}>}) {
  const [user,params] = await Promise.all([getSessionUser(),searchParams])
  const month=resolveDashboardMonth(params.month)
  const attentionMode = params.attention === 'month' ? 'month' : 'all'
  const [year,monthNumber]=month.split('-').map(Number)
  const nextMonth=monthNumber===12 ? `${year+1}-01` : `${year}-${String(monthNumber+1).padStart(2,'0')}`
  const from=`${month}-01T00:00:00+07:00`,toExclusive=`${nextMonth}-01T00:00:00+07:00`
  const isPic = user.roleLevel === 2
  const card = ['total','todo','overdue','blocked','review','deadline','done'].includes(params.card??'') ? params.card??'total' : 'total'
  const cardHref=(key:string)=>`/dashboard?month=${encodeURIComponent(month)}&attention=${attentionMode}&card=${key}`
  const [metrics, tasksPerhatian, performance] = await Promise.all([
    attentionMode === 'all' ? getDashboardMetrics(user) : getDashboardMetrics(user,from,toExclusive),
    attentionMode === 'all' ? getTasksPerluPerhatian(user,100000,undefined,undefined,card) : getTasksPerluPerhatian(user,100000,from,toExclusive,card),
    isPic ? Promise.resolve(null) : attentionMode === 'all' ? getDashboardPerformance(user,new Date(),undefined,undefined,card) : getDashboardPerformance(user,new Date(),from,toExclusive,card),
  ])

  const filteredTasks = tasksPerhatian
  const showAlert =
    metrics.tertinggal > 0 || metrics.blocked > 0

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8">
      <WorkspaceTabs current="/dashboard" tabs={DASHBOARD_TABS} roleLevel={user.roleLevel} />
      {/* Judul halaman + filter periode */}
      <section className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <DashboardWelcome name={user.name} />
        <form method="get" action="/dashboard" className="flex flex-wrap items-center gap-3 sm:ml-auto sm:justify-end">
          <input type="month" name="month" defaultValue={month} aria-label="Periode bulan dan tahun" className="rounded-full border px-4 py-2 text-sm" />
          <label className="sr-only" htmlFor="attention-mode">Cakupan Task Perlu Perhatian</label>
          <select id="attention-mode" name="attention" defaultValue={attentionMode} aria-label="Cakupan Task Perlu Perhatian" className="rounded-full border px-3 py-2 text-sm bg-[var(--color-bg-card)] text-[var(--color-text-primary)]">
            <option value="month">Per Bulan</option>
            <option value="all">Akumulatif</option>
          </select>
          <input type="hidden" name="card" value={card}/>
          <button className="atm-cta !w-auto !py-2">Terapkan</button>
        </form>
      </section>

      {/* Banner peringatan */}
      {showAlert && (
        <section className="mb-6">
          <div className="atm-notice flex items-center gap-3 rounded-lg px-4 py-3" role="alert">
            <span aria-hidden="true" className="atm-live-indicator shrink-0 !bg-[var(--st-revisi-dot)]" style={{ animation: 'none' }} />
            <p className="text-sm font-medium leading-relaxed">
              {metrics.tertinggal > 0 && (
                <>{metrics.tertinggal} task melewati tenggat dan belum selesai. </>
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
        className={`grid grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-6 atm-stagger gap-3 sm:gap-4 mb-7`}
        aria-label={`Ringkasan metrics ${attentionMode === 'all' ? 'akumulatif' : 'per bulan'}`}
      >
        <MetricCard label={isPic ? 'Total Ditugaskan' : 'Total Task'} value={metrics.totalTask} href={cardHref("total")} active={card==="total"} />
        {isPic ? <>
          <MetricCard label="Selesai" value={metrics.completed} tone="done" />
          <MetricCard label="Belum Dimulai" value={metrics.pending} tone="revisi" href={cardHref("todo")} active={card==="todo"} />
          <MetricCard label="Menunggu Review" value={metrics.menuungguReview} tone="review" href={cardHref("review")} active={card==="review"} />
          <MetricCard label="Melewati Tenggat" value={metrics.tertinggal} tone="revisi" href={cardHref("overdue")} active={card==="overdue"} />
          <MetricCard label="Blocked" value={metrics.blocked} tone="blocked" href={cardHref("blocked")} active={card==="blocked"} />
        </> : <>
          <MetricCard label="Melewati Tenggat" value={metrics.tertinggal} tone="revisi" />
          <MetricCard label="Blocked" value={metrics.blocked} tone="blocked" />
          <MetricCard label="Menunggu Review" value={metrics.menuungguReview} tone="review" />
          <MetricCard label="Belum Dimulai" value={metrics.pending} tone="revisi" href={cardHref("todo")} active={card==="todo"} />
          <MetricCard label="Pengajuan Deadline" value={metrics.pengajuanDeadline} tone="progress" href={cardHref('deadline')} active={card==='deadline'} />
        </>}
      </section>

      {isPic ? (
        <section className="atm-card mb-7 p-5" aria-label="Progress penyelesaian task pribadi">
          <div className="mb-2 flex items-center justify-between text-sm">
            <h2 className="font-semibold text-slate-800">Progress Penyelesaian Saya</h2>
            <span className="font-bold text-[var(--color-brand)]">{metrics.totalTask ? Math.round(metrics.completed / metrics.totalTask * 100) : 0}%</span>
          </div>
          <ProgressBar value={metrics.totalTask ? Math.round(metrics.completed / metrics.totalTask * 100) : 0} />
        </section>
      ) : performance ? <div className="mb-7"><PerformanceOverview performance={performance} /></div> : null}

      {/* Tabel task perlu perhatian */}
      <section aria-label="Task perlu perhatian">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="atm-eyebrow !text-[var(--color-text-secondary)]">
          Task Perlu Perhatian <span className="font-normal normal-case">({attentionMode === "all" ? "Akumulatif" : "Per Bulan"})</span>
        </h2><div className="flex gap-2"><a className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-semibold" href={`/dashboard/export?month=${encodeURIComponent(month)}&attention=${attentionMode}&card=${card}&format=xls`}>Export Excel</a><a className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-semibold" href={`/dashboard/export?month=${encodeURIComponent(month)}&attention=${attentionMode}&card=${card}&format=pdf`}>Export PDF</a></div></div>

        {filteredTasks.length === 0 ? (
          <div className="atm-card p-12 text-center">
            <p className="text-sm text-slate-400">
              Tidak ada task yang memerlukan perhatian saat ini.
            </p>
          </div>
        ) : (
          <div className="atm-card atm-appear overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr>
                  <th className="py-3 px-2 sm:px-3 font-semibold" scope="col">TASK</th>
                  <th className="py-3 px-2 sm:px-3 font-semibold" scope="col">PIC</th>
                  <th className="py-3 px-2 sm:px-3 font-semibold" scope="col">TENGGAT</th>
                  <th className="py-3 px-2 sm:px-3 font-semibold" scope="col">WAKTU BERJALAN</th>
                  <th className="py-3 px-2 sm:px-3 font-semibold" scope="col">PROGRESS</th>
                  <th className="py-3 px-2 sm:px-3 font-semibold" scope="col">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredTasks.map((task) => (
                  <tr key={task.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-2 sm:px-3 font-semibold text-slate-800 whitespace-nowrap">
                      <Link
                        href={`/tasks/${task.id}`}
                        className="hover:text-[var(--color-brand)] transition-colors"
                      >
                        {task.title}
                      </Link>
                    </td>
                    <td className="py-3.5 px-2 sm:px-3 text-slate-600 whitespace-nowrap">
                      {task.ownerName}
                    </td>
                    <td className="py-3.5 px-2 sm:px-3 text-slate-600 whitespace-nowrap">
                      {formatDate(task.dueDate)}
                    </td>
                    <td className="py-3.5 px-2 sm:px-3 whitespace-nowrap">
                      <TimeProgress
                        timePct={task.timePct}
                        isOverdue={task.isOverdue}
                      />
                    </td>
                    <td className="py-3.5 px-2 sm:px-3 whitespace-nowrap">
                      <ProgressBar value={task.progressPct} />
                    </td>
                    <td className="py-3.5 px-2 sm:px-3 whitespace-nowrap">
                      <StatusBadge status={task.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredTasks.length > 0 && (
          <div className="mt-3 text-right">
            <Link
              href="/tasks"
              className="atm-link text-xs font-medium"
            >
              Lihat semua task →
            </Link>
          </div>
        )}
      </section>
    </div>
  )
}
