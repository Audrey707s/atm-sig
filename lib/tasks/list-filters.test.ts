import { describe, expect, it } from 'vitest'
import { parseTaskListFilters, safeTaskFilterQuery } from './list-filters'
import type { SessionUser } from '@/lib/auth/session'
const user = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', roleLevel: 2 } as SessionUser

describe('task list filters', () => {
  it('separates creation and due months, including leap years', () => {
    const { filters } = parseTaskListFilters({ month: '2028-02', dueMonth: '2028-03' }, user)
    expect(filters.createdFrom).toBe('2028-02-01')
    expect(filters.createdTo).toBe('2028-02-29')
    expect(filters.dueTo).toBe('2028-03-31')
  })
  it('rejects malformed values and cannot override a PIC owner scope', () => {
    const { filters, mine } = parseTaskListFilters({ owner: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', page: '-3', section: '1e100', progress: '101', status: ['Done'], month: 'bad' }, user)
    expect(mine).toBe(true)
    expect(filters).toMatchObject({ ownerId: user.id, page: 1, orgUnitId: null, progressPct: null, status: null, createdFrom: null })
  })
  it('always binds assigned-review to the signed-in user', () => {
    expect(parseTaskListFilters({ view: 'assigned-review', reviewer: 'other' }, { ...user, roleLevel: 6 }).filters.reviewerId).toBe(user.id)
  })
  it('saved filters strip destinations, tokens and page numbers', () => {
    expect(safeTaskFilterQuery('next=https://evil.test&token=secret&page=7&status=Revisi&mine=1')).toBe('status=Revisi&mine=1')
  })
})
