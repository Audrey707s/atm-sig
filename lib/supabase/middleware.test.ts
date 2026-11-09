import { AuthSessionMissingError } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateSession } from './middleware'

// Profil dan level role diambil dalam SATU query (relasi users -> roles).
const { getUser, signOut, from, profileResult } = vi.hoisted(() => ({
  getUser: vi.fn(),
  signOut: vi.fn(),
  from: vi.fn(),
  profileResult: { data: { status: 'aktif', role: { level: 6 } }, error: null } as {
    data: { status: string; role: { level: number } | null } | null
    error: { message: string } | null
  },
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser, signOut },
    from,
  }),
}))

describe('updateSession (FR-001)', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
    getUser.mockReset()
    signOut.mockReset().mockResolvedValue({ error: null })
    profileResult.data = { status: 'aktif', role: { level: 6 } }
    profileResult.error = null
    from.mockReset().mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve(profileResult),
        }),
      }),
    }))
  })

  it('redirects unauthenticated protected requests to login', async () => {
    getUser.mockResolvedValue({ data: { user: null } })

    const response = await updateSession(
      new NextRequest('https://atm.example/tasks'),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://atm.example/login')
  })

  it('allows the login page without logging an expected missing session as an error', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() })
    const response = await updateSession(new NextRequest('https://atm.example/login'))
    expect(response.status).toBe(200)
    expect(log).not.toHaveBeenCalled()
  })

  it('still logs unexpected authentication failures and protects private pages', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'Auth service unavailable' } })
    const response = await updateSession(new NextRequest('https://atm.example/tasks'))
    expect(response.headers.get('location')).toBe('https://atm.example/login')
    expect(log).toHaveBeenCalledWith('Supabase getUser error:', 'Auth service unavailable')
  })

  it('redirects an authenticated user away from the login page', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-id' } } })

    const response = await updateSession(
      new NextRequest('https://atm.example/login'),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://atm.example/dashboard')
  })

  it('signs out and redirects an inactive user', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-id' } } })
    profileResult.data = { status: 'nonaktif', role: { level: 6 } }

    const response = await updateSession(
      new NextRequest('https://atm.example/tasks'),
    )

    expect(signOut).toHaveBeenCalledOnce()
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://atm.example/login?error=account_inactive',
    )
  })

  it('fails closed when the account status cannot be verified', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-id' } } })
    profileResult.data = null
    profileResult.error = { message: 'profile lookup failed' }

    const response = await updateSession(
      new NextRequest('https://atm.example/tasks'),
    )

    expect(signOut).toHaveBeenCalledOnce()
    expect(response.headers.get('location')).toBe(
      'https://atm.example/login?error=account_unavailable',
    )
  })

  it('redirects roles below Staff/PIC away from the dashboard', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-id' } } })
    profileResult.data = { status: 'aktif', role: { level: 1 } }

    const response = await updateSession(
      new NextRequest('https://atm.example/dashboard'),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://atm.example/tasks?error=forbidden',
    )
  })

  it('allows a Spectator to open their own profile', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-id' } } })
    profileResult.data = { status: 'aktif', role: { level: 1 } }

    const response = await updateSession(
      new NextRequest('https://atm.example/account'),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })

  it('redirects roles below Manager away from performance analytics', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-id' } } })
    profileResult.data = { status: 'aktif', role: { level: 2 } }

    const response = await updateSession(
      new NextRequest('https://atm.example/performance'),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://atm.example/tasks?error=forbidden',
    )
  })

  it('redirects roles below Manager away from user management', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-id' } } })
    profileResult.data = { status: 'aktif', role: { level: 2 } }

    const response = await updateSession(
      new NextRequest('https://atm.example/users'),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://atm.example/tasks?error=forbidden',
    )
  })

  it('fails closed when the profile role cannot be verified', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-id' } } })
    profileResult.data = { status: 'aktif', role: null }

    const response = await updateSession(
      new NextRequest('https://atm.example/tasks'),
    )

    expect(signOut).toHaveBeenCalledOnce()
    expect(response.headers.get('location')).toBe(
      'https://atm.example/login?error=account_unavailable',
    )
  })

  it('verifies status and role with a single profile query', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-id' } } })

    const response = await updateSession(
      new NextRequest('https://atm.example/tasks'),
    )

    expect(response.status).toBe(200)
    expect(from).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith('users')
  })

  it('does not treat other paths beginning with login as public', async () => {
    getUser.mockResolvedValue({ data: { user: null } })

    const response = await updateSession(
      new NextRequest('https://atm.example/login-private'),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://atm.example/login')
  })

  it.each(['/signup', '/forgot-password', '/reset-password', '/auth/confirm'])(
    'allows unauthenticated access to %s',
    async (path) => {
      getUser.mockResolvedValue({ data: { user: null } })

      const response = await updateSession(new NextRequest(`https://atm.example${path}`))

      expect(response.status).toBe(200)
      expect(response.headers.get('location')).toBeNull()
    },
  )
})
