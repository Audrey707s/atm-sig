// T-507 / FR-110 / BR-080: status controls follow the role and task state.
'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { TASK_STATUSES, type TaskStatus } from '@/lib/constants/rbac'
import type { SessionUser } from '@/lib/auth/session'
import type { TaskListItem } from '@/lib/tasks/queries'
import { updateTaskStatus } from '@/lib/tasks/actions'
import { isAllowedTaskStatusTransition } from '@/lib/tasks/status'

const statusClass: Record<TaskStatus, string> = {
  'To do': 'todo', 'In progress': 'progress', Blocked: 'blocked', Review: 'review', Revisi: 'revisi', Done: 'done',
}

function Card({ task, user }: { task: TaskListItem; user: SessionUser }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const isOwner = task.ownerId === user.id
  const isReviewer = task.reviewerId === user.id
  const canSelfReview = isOwner && user.roleLevel >= 5 && task.reviewerId === null
  const canManageTask = user.roleLevel >= 3
  const transitions = task.status !== 'Review'
    ? TASK_STATUSES.filter((next) => isAllowedTaskStatusTransition(task.status, next, {
        isOwner,
        isReviewer: false,
        canManageTask,
        ownerRoleLevel: user.roleLevel,
      }))
    : []

  function move(status: TaskStatus) {
    setMessage('')
    startTransition(async () => {
      const result = await updateTaskStatus({ taskId: task.id, status })
      if ('error' in result) setMessage(result.error ?? 'Status task tidak dapat diperbarui.')
      else router.refresh()
    })
  }

  const dueDate = new Intl.DateTimeFormat('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta',
  }).format(new Date(task.dueDate))

  return (
    <article className="atm-kcard atm-spotlight group p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className={`atm-pill atm-priority-${task.priority} !px-2 !py-0.5 !text-[10px] uppercase tracking-wide`}>
          {task.priority}
        </span>
        {task.isOverdue && <span className="atm-pill atm-overdue !px-2 !py-0.5 !text-[10px]">Lewat</span>}
      </div>

      <Link href={`/tasks/${task.id}`} className="mt-3 block text-sm font-medium leading-5 tracking-tight text-slate-900 transition-colors hover:text-[var(--color-interactive-soft)]">
        {task.title}
      </Link>

      <div className="mt-3 flex items-center gap-2 text-xs text-slate-600">
        <span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg-raised)] font-[family-name:var(--font-mono)] text-[10px] font-semibold text-slate-700">
          {task.ownerName.slice(0, 1).toLocaleUpperCase('id-ID')}
        </span>
        <span className="min-w-0 truncate">{task.ownerName}</span>
      </div>
      <p className="mt-1 truncate pl-8 text-[11px] text-slate-500">{task.orgUnitName}</p>

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[11px]">
        <span className="text-slate-500">Tenggat</span>
        <time dateTime={task.dueDate} className={task.isOverdue ? 'font-semibold text-red-700' : 'font-medium text-slate-700'}>{dueDate}</time>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div role="progressbar" aria-label={`Progress ${task.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={task.progressPct} className="atm-progress-track h-1 flex-1">
          <div className="atm-progress-fill h-full rounded-full" style={{ width: `${task.progressPct}%`, backgroundColor: 'var(--color-brand)' }} />
        </div>
        <span className="w-8 text-right font-[family-name:var(--font-mono)] text-[10px] font-medium tabular-nums text-slate-600">{task.progressPct}%</span>
      </div>

      {transitions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2.5" aria-label="Pindahkan status task">
          {transitions.map((next) => (
            <button key={next} type="button" disabled={pending} onClick={() => move(next)} className="rounded-full border border-[var(--color-border-strong)] px-2.5 py-1 text-[10px] font-medium text-slate-700 transition hover:border-[var(--color-interactive)] hover:bg-[var(--color-interactive)] hover:text-white disabled:cursor-wait disabled:opacity-50">
              {pending ? 'Memproses…' : `→ ${next}`}
            </button>
          ))}
        </div>
      )}
      {(isReviewer || canSelfReview) && task.status === 'Review' && (
        <Link href={`/tasks/${task.id}/review`} className="mt-3 inline-flex rounded-full bg-[var(--color-brand)] px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-[var(--color-interactive)]">
          {canSelfReview ? 'Review sendiri' : 'Buka review'}
        </Link>
      )}
      {message && <p role="alert" className="mt-2 text-xs text-red-700">{message}</p>}
    </article>
  )
}

export default function KanbanBoard({ tasks, user }: { tasks: TaskListItem[]; user: SessionUser }) {
  return (
    <div className="overflow-x-auto pb-3" tabIndex={0} aria-label="Papan Kanban, geser mendatar untuk melihat semua status">
      <div className="grid min-w-[1320px] grid-cols-6 gap-3 xl:gap-4">
        {TASK_STATUSES.map((status) => {
          const cards = tasks.filter((task) => task.status === status)
                    return (
            <section key={status} aria-label={`${status}, ${cards.length} task`} className="atm-kcol min-h-64 p-2.5">
              <header className="mb-3 flex items-center justify-between gap-2 px-1 py-1">
                <h2 className="atm-mono flex items-center gap-2 !text-[var(--color-text-secondary)]">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: `var(--st-${statusClass[status]}-dot)` }} />
                  {status}
                </h2>
                <span className="atm-mono min-w-7 rounded-full border border-[var(--color-border)] px-2 py-0.5 text-center tabular-nums">{cards.length}</span>
              </header>
              <div className="atm-stagger space-y-2.5">
                {cards.map((task) => <Card key={task.id} task={task} user={user} />)}
                {cards.length === 0 && <p className="rounded-lg border border-dashed border-[var(--color-border-strong)] px-3 py-7 text-center text-xs text-slate-500">Belum ada task</p>}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
