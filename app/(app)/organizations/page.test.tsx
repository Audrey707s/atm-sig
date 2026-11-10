import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
const { getSessionUser, createClient, createAdminClient } = vi.hoisted(() => ({ getSessionUser: vi.fn(), createClient: vi.fn(), createAdminClient: vi.fn() }))
vi.mock('@/lib/auth/session', () => ({ getSessionUser }))
vi.mock('@/lib/supabase/server', () => ({ createClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))
import OrganizationsPage from './page'

beforeEach(() => {
  vi.clearAllMocks()
  const client = { from: (table: string) => {
    const data = table === 'org_units' ? [{ id: 1, name: 'Accounting', type: 'department', parent_id: null }]
      : table === 'users' ? [{ id: 'member', name: 'Nama Anggota', org_unit_id: 1, supervisor_id: null, role_id: 1 }]
      : [{ id: 1, name: 'Staff/PIC' }]
    const query = { select: () => query, order: () => query, eq: () => query, then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve) }
    return query
  } }
  createClient.mockResolvedValue(client)
  createAdminClient.mockReturnValue(client)
})
describe('Organizations read-only workspace', () => {
  it.each([1, 2, 3, 4, 5, 6])('renders hierarchy for authenticated role %i without edit controls', async roleLevel => {
    getSessionUser.mockResolvedValue({ id: 'user', roleLevel })
    const html = renderToStaticMarkup(await OrganizationsPage())
    expect(html).toContain('Accounting')
    expect(html).toContain('Nama Anggota')
    expect(html).not.toContain('<form')
    expect(html).not.toContain('Simpan')
    expect(html).not.toContain('Hapus')
    expect(createAdminClient).toHaveBeenCalledTimes(roleLevel === 1 ? 1 : 0)
  })
  it('checks authentication before querying data', async () => {
    getSessionUser.mockRejectedValue(new Error('redirect-login'))
    await expect(OrganizationsPage()).rejects.toThrow('redirect-login')
    expect(createClient).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
  })
})
