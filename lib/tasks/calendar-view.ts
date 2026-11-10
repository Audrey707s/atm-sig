import type { SessionUser } from '@/lib/auth/session'
import { getTaskList, type TaskListItem } from './queries'
import { resolveDashboardMonth } from '@/lib/dashboard/month'

export function calendarMonth(requested?: string) {
  const month = resolveDashboardMonth(requested)
  const [year, number] = month.split('-').map(Number)
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate()
  const shift = (offset: number) => new Date(Date.UTC(year, number - 1 + offset, 1)).toISOString().slice(0, 7)
  return { month, days, offset: (new Date(Date.UTC(year, number - 1, 1)).getUTCDay() + 6) % 7, previous: shift(-1), next: shift(1), dueFrom: `${month}-01`, dueTo: `${month}-${days}` }
}
export function jakartaDay(date: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date))
}
export function googleCalendarLink(task: TaskListItem): string {
  const day = jakartaDay(task.dueDate)
  const end = new Date(`${day}T00:00:00Z`)
  end.setUTCDate(end.getUTCDate() + 1)
  const params = new URLSearchParams({ action: 'TEMPLATE', text: task.title, dates: `${day.replaceAll('-', '')}/${end.toISOString().slice(0, 10).replaceAll('-', '')}`, ctz: 'Asia/Jakarta' })
  return `https://calendar.google.com/calendar/render?${params}`
}
export async function getCalendarTasks(user: SessionUser, month: string, personal: boolean): Promise<TaskListItem[]> {
  const { dueFrom, dueTo } = calendarMonth(month)
  const items: TaskListItem[] = []
  for (let page = 1; page <= 10; page++) {
    const result = await getTaskList(user, { dueFrom, dueTo, page, pageSize: 100, ownerId: user.roleLevel === 2 ? user.id : null })
    if (result.total > 1000) throw new Error('Kalender memuat lebih dari 1.000 tugas. Hubungi administrator untuk mempersempit cakupan.')
    items.push(...result.items)
    if (items.length >= result.total || result.items.length < 100) break
  }
  return personal ? items.filter(task => task.ownerId === user.id || task.reviewerId === user.id) : items
}
