import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getSessionUser, createClient, revalidatePath, rpc } = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({ getSessionUser }))
vi.mock('@/lib/supabase/server', () => ({ createClient }))
vi.mock('next/cache', () => ({ revalidatePath }))

import { updateMyProfile } from './actions'

describe('self-service profile action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSessionUser.mockResolvedValue({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      role: 'Spectator',
      roleLevel: 1,
    })
    createClient.mockResolvedValue({ rpc })
    rpc.mockResolvedValue({ data: 'Nama Baru', error: null })
  })

  it('lets every authenticated role update its own normalized name', async () => {
    const form = new FormData()
    form.set('name', '  Nama   Baru  ')

    const result = await updateMyProfile({ status: 'idle' }, form)

    expect(rpc).toHaveBeenCalledWith('update_my_profile', { p_name: 'Nama Baru' })
    expect(result).toEqual({
      status: 'success',
      message: 'Profil berhasil diperbarui.',
      name: 'Nama Baru',
    })
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('rejects invalid names before calling the database', async () => {
    const form = new FormData()
    form.set('name', 'A')

    const result = await updateMyProfile({ status: 'idle' }, form)

    expect(result.status).toBe('error')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('does not expose database errors to the interface', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'internal detail' } })
    const form = new FormData()
    form.set('name', 'Nama Baru')

    const result = await updateMyProfile({ status: 'idle' }, form)

    expect(result).toEqual({
      status: 'error',
      message: 'Profil belum dapat disimpan. Silakan coba lagi.',
    })
  })
})
