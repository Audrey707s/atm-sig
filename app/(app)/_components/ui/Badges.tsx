// Komponen UI reusable: Badge status task, prioritas, dll.
// Dipakai di seluruh aplikasi untuk konsistensi visual

import type { TaskStatus } from '@/lib/constants/rbac'

// =================== STATUS BADGE ===================

const STATUS_LABELS: Record<TaskStatus, string> = {
  'To do': 'Belum Dimulai',
  'In progress': 'Dalam Pengerjaan',
  'Blocked': 'Terhambat',
  'Review': 'Menunggu Tinjauan',
  'Revisi': 'Perlu Revisi',
  'Done': 'Selesai',
}

type StatusBadgeProps = {
  status: TaskStatus
  className?: string
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const statusClass = { 'To do': 'todo', 'In progress': 'progress', Blocked: 'blocked', Review: 'review', Revisi: 'revisi', Done: 'done' }[status]
  return (
    <span className={`atm-pill atm-status-${statusClass} ${className}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

// =================== PRIORITAS BADGE ===================

type Priority = 'rendah' | 'sedang' | 'tinggi'

const PRIORITY_LABELS: Record<Priority, string> = { rendah: 'Rendah', sedang: 'Sedang', tinggi: 'Tinggi' }

type PriorityBadgeProps = {
  priority: Priority
  className?: string
}

export function PriorityBadge({ priority, className = '' }: PriorityBadgeProps) {
  return (
    <span className={`atm-pill atm-priority-${priority} ${className}`}>
      {PRIORITY_LABELS[priority]}
    </span>
  )
}

// =================== PROGRESS BAR ===================

type ProgressBarProps = {
  value: number  // 0–100
  className?: string
  showLabel?: boolean
}

function progressColor(value: number, isOverdue?: boolean): string {
  if (isOverdue) return 'var(--st-blocked-dot)'
  if (value >= 100) return 'var(--st-done-dot)'
  if (value >= 80) return 'var(--st-revisi-dot)'
  return 'var(--st-progress-dot)'
}

export function ProgressBar({ value, className = '', showLabel = true }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value))
  const color = progressColor(clamped)

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="atm-progress-track w-24" style={{ height: '6px' }}>
        <div
          className="atm-progress-fill h-full rounded-full"
          style={{ width: `${clamped}%`, backgroundColor: color }}
        />
      </div>
      {showLabel && (
        <span className="min-w-[2.5rem] font-[family-name:var(--font-mono)] text-xs font-medium tabular-nums text-slate-700">
          {clamped}%
        </span>
      )}
    </div>
  )
}

// =================== TIME PROGRESS (waktu berjalan) ===================

type TimeProgressProps = {
  /** Persentase waktu berjalan (0–100+) */
  timePct: number
  isOverdue: boolean
  className?: string
}

export function TimeProgress({ timePct, isOverdue, className = '' }: TimeProgressProps) {
  if (isOverdue) {
    return (
      <span
        className={`atm-pill atm-overdue ${className}`}
      >
        Lewat
      </span>
    )
  }
  return (
    <span className={`font-[family-name:var(--font-mono)] text-xs font-medium tabular-nums text-slate-600 ${className}`}>
      {Math.round(timePct)}%
    </span>
  )
}
