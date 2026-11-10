import type { SessionUser } from '@/lib/auth/session'
import type { TaskFilters } from './queries'
import { isValidUuid } from './validation'
import { TASK_STATUSES } from '@/lib/constants/rbac'

export type ListParams = Record<string, string | string[] | undefined>
const scalar = (value: string | string[] | undefined) => typeof value === 'string' ? value : ''
export function parseTaskListFilters(params: ListParams, user: SessionUser): { filters: TaskFilters; mine: boolean } {
  const value = (key: string) => scalar(params[key])
  const monthRange = (key: string): [string | null, string | null] => {
    const month = value(key)
    if (!/^(20\d{2})-(0[1-9]|1[0-2])$/.test(month)) return [null, null]
    const [year, number] = month.split('-').map(Number)
    return [`${month}-01`, new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10)]
  }
  const [createdFrom, createdTo] = monthRange('month')
  const [dueFrom, dueTo] = monthRange('dueMonth')
  const mine = user.roleLevel < 3 || value('mine') === '1'
  const status = TASK_STATUSES.find(status => status === value('status')) ?? null
  const priority = ['rendah', 'sedang', 'tinggi'].find(priority => priority === value('priority')) as TaskFilters['priority']
  const page = Number(value('page'))
  const section = Number(value('section'))
  const progress = value('progress')
  const view = ['active', 'overdue', 'assigned-review'].find(view => view === value('view')) as TaskFilters['attention']
  return { mine, filters: {
    status, priority: priority ?? null, search: value('search').trim().slice(0, 100) || null,
    ownerId: mine ? user.id : isValidUuid(value('owner')) ? value('owner') : null,
    orgUnitId: Number.isSafeInteger(section) && section > 0 ? section : null,
    createdFrom, createdTo, dueFrom, dueTo,
    progressPct: /^\d{1,3}$/.test(progress) && Number(progress) <= 100 ? Number(progress) : null,
    page: Number.isSafeInteger(page) && page > 0 && page <= 100000 ? page : 1,
    pageSize: 20, attention: view,
    reviewerId: view === 'assigned-review' ? user.id : null,
  } }
}

export const SAVED_FILTER_KEYS = ['status', 'priority', 'search', 'section', 'owner', 'mine', 'month', 'dueMonth', 'progress', 'view', 'density']
export function safeTaskFilterQuery(query: string): string {
  const source = new URLSearchParams(query)
  const result = new URLSearchParams()
  for (const key of SAVED_FILTER_KEYS) {
    const value = source.get(key)
    if (value && value.length <= 100) result.set(key, value)
  }
  return result.toString()
}
