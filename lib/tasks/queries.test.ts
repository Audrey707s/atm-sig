import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClient, getTaskScopeFilter } = vi.hoisted(() => ({
  createClient: vi.fn(),
  getTaskScopeFilter: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient }))
vi.mock('./scope', () => ({ getTaskScopeFilter }))

import { getPendingDeadlineRequests, getTaskList } from './queries'

const user = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'pic@example.test',
  name: 'PIC',
  role: 'Staff/PIC' as const,
  roleLevel: 2,
  orgUnitId: 4,
  supervisorId: null,
}

describe('getTaskList (FR-029)', () => {
  let query: {
    select: ReturnType<typeof vi.fn>
    order: ReturnType<typeof vi.fn>
    range: ReturnType<typeof vi.fn>
    or: ReturnType<typeof vi.fn>
    eq: ReturnType<typeof vi.fn>
    ilike: ReturnType<typeof vi.fn>
    gte: ReturnType<typeof vi.fn>
    lte: ReturnType<typeof vi.fn>
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>
  }

  beforeEach(() => {
    vi.clearAllMocks()
    getTaskScopeFilter.mockResolvedValue('org_unit_id.in.(4),owner_id.eq.aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    query = {
      select: vi.fn(() => query),
      order: vi.fn(() => query),
      range: vi.fn(() => query),
      or: vi.fn(() => query),
      eq: vi.fn(() => query),
      ilike: vi.fn(() => query),
      gte: vi.fn(() => query),
      lte: vi.fn(() => query),
      then: (resolve, reject) => Promise.resolve({
        data: [{
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          title: 'Reconciliation',
          status: 'In progress',
          priority: 'tinggi',
          progress_pct: 42,
          start_date: '2026-10-20T00:00:00.000Z',
          due_date: '2026-10-30T00:00:00.000Z',
          completed_at: null,
          created_at: '2026-10-19T00:00:00.000Z',
          owner_id: user.id,
          owner: { name: 'PIC' },
          assigner: { name: 'Manager' },
          reviewer: null,
          org_unit: { name: 'Section 1' },
        }],
        error: null,
        count: 1,
      }).then(resolve, reject),
    }
    createClient.mockResolvedValue({ from: vi.fn(() => query) })
  })

  describe('getPendingDeadlineRequests (FR-061)', () => {
    beforeEach(() => vi.clearAllMocks())

    it('loads pending requests with task and requester names for SM and above', async () => {
      const query = {
        select: vi.fn(),
        eq: vi.fn(),
        order: vi.fn(),
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve({
            data: [{
              id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
              task_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              old_due_date: '2026-10-30T00:00:00.000Z',
              new_due_date: '2026-11-02T00:00:00.000Z',
              reason: 'Menunggu dokumen',
              created_at: '2026-10-20T00:00:00.000Z',
              status: 'Menunggu approval',
              requester: { name: 'Sari' },
              task: {
                title: 'Rekonsiliasi bank',
                owner: { name: 'Sari' },
                org_unit: { name: 'Cost Accounting' },
              },
            }],
            error: null,
          }).then(resolve, reject),
      }
      query.select.mockReturnValue(query)
      query.eq.mockReturnValue(query)
      query.order.mockReturnValue(query)
      createClient.mockResolvedValue({ from: vi.fn(() => query) })

      const result = await getPendingDeadlineRequests({
        ...user,
        role: 'SM',
        roleLevel: 4,
      })

      expect(result).toEqual([{
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        taskId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        taskTitle: 'Rekonsiliasi bank',
        requesterName: 'Sari',
        orgUnitName: 'Cost Accounting',
        oldDueDate: '2026-10-30T00:00:00.000Z',
        newDueDate: '2026-11-02T00:00:00.000Z',
        reason: 'Menunggu dokumen',
        createdAt: '2026-10-20T00:00:00.000Z',
        status: 'Menunggu approval',
      }])
    })

    it('rejects a role below SM before querying', async () => {
      await expect(getPendingDeadlineRequests(user)).rejects.toThrow(/Hanya SM/i)
      expect(createClient).not.toHaveBeenCalled()
    })
  })

  it('combines scope with status, PIC, section, text, and overlapping period filters', async () => {
    const result = await getTaskList(user, {
      status: 'In progress',
      priority: 'tinggi',
      ownerId: user.id,
      orgUnitId: 4,
      search: ' reconciliation ',
      dateFrom: '2026-10-01',
      dateTo: '2026-10-31',
    })

    expect(result.total).toBe(1)
    expect(query.or).toHaveBeenCalledWith(expect.stringContaining('owner_id.eq.'))
    expect(query.eq).toHaveBeenCalledWith('status', 'In progress')
    expect(query.eq).toHaveBeenCalledWith('priority', 'tinggi')
    expect(query.eq).toHaveBeenCalledWith('owner_id', user.id)
    expect(query.eq).toHaveBeenCalledWith('org_unit_id', 4)
    expect(query.ilike).toHaveBeenCalledWith('title', '%reconciliation%')
    expect(query.gte).toHaveBeenCalledWith('due_date', '2026-10-01T00:00:00.000+07:00')
    expect(query.lte).toHaveBeenCalledWith('start_date', '2026-10-31T23:59:59.999+07:00')
  })

  it.each([
    { orgUnitId: 0 },
    { ownerId: 'not-a-uuid' },
    { dateFrom: '2026-02-30' },
    { dateFrom: '2026-11-01', dateTo: '2026-10-01' },
  ])('rejects invalid filter input before querying', async (filters) => {
    await expect(getTaskList(user, filters)).rejects.toThrow()
    expect(createClient).not.toHaveBeenCalled()
  })
})
