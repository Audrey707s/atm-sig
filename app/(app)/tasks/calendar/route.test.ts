import { beforeEach, describe, expect, it, vi } from 'vitest'
const { getSessionUser, getTaskList } = vi.hoisted(() => ({ getSessionUser: vi.fn(), getTaskList: vi.fn() }))
vi.mock('@/lib/auth/session', () => ({ getSessionUser }))
vi.mock('@/lib/tasks/queries', () => ({ getTaskList }))
import { GET } from './route'
const user = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', roleLevel: 2 }
beforeEach(() => { vi.clearAllMocks(); getSessionUser.mockResolvedValue(user); getTaskList.mockResolvedValue({ items: [], total: 0 }) })
describe('authenticated export', () => {
  it('ignores attacker owner for PIC and never caches private exports', async () => {
    const result = await GET(new Request('https://atm-sig.vercel.app/tasks/calendar?owner=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'))
    expect(getTaskList).toHaveBeenCalledWith(user, expect.objectContaining({ ownerId: user.id, page: 1 }))
    expect(result.headers.get('Cache-Control')).toBe('private, no-store')
    expect(result.headers.get('Content-Type')).toContain('text/calendar')
  })
  it('requires authentication before querying', async () => {
    getSessionUser.mockRejectedValue(new Error('redirect'))
    await expect(GET(new Request('https://atm-sig.vercel.app/tasks/calendar'))).rejects.toThrow('redirect')
    expect(getTaskList).not.toHaveBeenCalled()
  })
  it('refuses oversized exports instead of silently truncating', async () => {
    getTaskList.mockResolvedValue({ items: [], total: 1001 })
    expect((await GET(new Request('https://atm-sig.vercel.app/tasks/calendar'))).status).toBe(422)
  })
  it('fails closed if the database is unavailable', async () => {
    getTaskList.mockRejectedValue(new Error('secret database details'))
    const result = await GET(new Request('https://atm-sig.vercel.app/tasks/calendar'))
    expect(result.status).toBe(503)
    expect(await result.text()).not.toContain('secret')
  })
})
