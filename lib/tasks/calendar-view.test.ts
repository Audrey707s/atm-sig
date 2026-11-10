import { beforeEach, describe, expect, it, vi } from 'vitest'
const { getTaskList } = vi.hoisted(() => ({ getTaskList: vi.fn() }))
vi.mock('./queries', () => ({ getTaskList }))
import { calendarMonth, getCalendarTasks, googleCalendarLink, jakartaDay } from './calendar-view'
import type { SessionUser } from '@/lib/auth/session'
import type { TaskListItem } from './queries'
const user = { id: 'me', roleLevel: 3 } as SessionUser
beforeEach(() => vi.clearAllMocks())
describe('calendar workspace', () => {
  it('handles leap years and month/year boundaries with Monday first', () => {
    expect(calendarMonth('2028-02')).toMatchObject({ days: 29, dueTo: '2028-02-29', offset: 1 })
    expect(calendarMonth('2026-01').previous).toBe('2025-12')
    expect(calendarMonth('2026-12').next).toBe('2027-01')
  })
  it('groups UTC timestamps into the correct Jakarta day and encodes Google event drafts', () => {
    expect(jakartaDay('2026-11-30T18:00:00Z')).toBe('2026-12-01')
    const url = new URL(googleCalendarLink({ title: 'Audit & closing #1', dueDate: '2026-11-30T18:00:00Z' } as TaskListItem))
    expect(url.origin).toBe('https://calendar.google.com')
    expect(url.searchParams.get('text')).toBe('Audit & closing #1')
    expect(url.searchParams.get('dates')).toBe('20261201/20261202')
  })
  it('uses authenticated task scope and includes assigned review in personal calendar', async () => {
    getTaskList.mockResolvedValue({ total: 3, items: [{ id: 'own', ownerId: 'me' }, { id: 'review', ownerId: 'other', reviewerId: 'me' }, { id: 'team', ownerId: 'other' }] })
    expect((await getCalendarTasks(user, '2026-11', true)).map(task => task.id)).toEqual(['own', 'review'])
    expect(getTaskList).toHaveBeenCalledWith(user, expect.objectContaining({ dueFrom: '2026-11-01', dueTo: '2026-11-30' }))
  })
  it('enforces PIC ownership even if all is requested', async () => {
    getTaskList.mockResolvedValue({ total: 0, items: [] })
    const pic = { ...user, roleLevel: 2 }
    await getCalendarTasks(pic, '2026-11', false)
    expect(getTaskList).toHaveBeenCalledWith(pic, expect.objectContaining({ ownerId: 'me' }))
  })
  it('does not silently hide tasks when more than one page exists', async () => {
    getTaskList.mockResolvedValueOnce({ total: 101, items: Array.from({ length: 100 }, (_, i) => ({ id: String(i) })) })
      .mockResolvedValueOnce({ total: 101, items: [{ id: 'last' }] })
    expect(await getCalendarTasks(user, '2026-11', false)).toHaveLength(101)
    expect(getTaskList).toHaveBeenLastCalledWith(user, expect.objectContaining({ page: 2 }))
  })
})
