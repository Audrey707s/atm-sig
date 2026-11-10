import { getSessionUser } from '@/lib/auth/session'
import { getTaskList, type TaskListItem } from '@/lib/tasks/queries'
import { parseTaskListFilters } from '@/lib/tasks/list-filters'
import { taskCalendar, taskCsv } from '@/lib/tasks/calendar'

export async function GET(request: Request) {
  const user = await getSessionUser()
  const url = new URL(request.url)
  const { filters } = parseTaskListFilters(Object.fromEntries(url.searchParams), user)
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
  try {
    // Bounded, sequential pages avoid database fan-out. Never silently truncate an export.
    const items: TaskListItem[] = []
    for (let page = 1; page <= 10; page++) {
      const result = await getTaskList(user, { ...filters, page, pageSize: 100 })
      if (result.total > 1000) return Response.json({ error: 'Lebih dari 1.000 tugas. Persempit filter sebelum ekspor.' }, { status: 422, headers })
      items.push(...result.items)
      if (result.items.length < 100 || items.length >= result.total) break
    }
    const csv = url.searchParams.get('format') === 'csv'
    return new Response(csv ? taskCsv(items) : taskCalendar(items, url.origin), { headers: {
      ...headers, 'Content-Type': csv ? 'text/csv; charset=utf-8' : 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="ATM-SIG-Tugas.${csv ? 'csv' : 'ics'}"`,
    } })
  } catch {
    return Response.json({ error: 'Ekspor gagal dimuat. Silakan coba kembali.' }, { status: 503, headers })
  }
}
