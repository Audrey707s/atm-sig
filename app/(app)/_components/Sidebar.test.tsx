// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import Sidebar from './Sidebar'
import type { SessionUser } from '@/lib/auth/session'

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }))
afterEach(() => cleanup())

function user(roleLevel: number): SessionUser {
  return { id: '11111111-1111-4111-8111-111111111111', roleLevel } as SessionUser
}

describe('sidebar navigation R.03', () => {
  it('renders menu icons and labels without duplicated decorative text', () => {
    render(<Sidebar user={user(6)} />)
    for (const label of ['Dashboard', 'Pekerjaan', 'Persetujuan', 'Laporan', 'Master User', 'Master Data']) {
      const link = screen.getByRole('link', { name: label })
      expect(link.querySelector('svg')).not.toBeNull()
      expect(link.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    }
  })
  it('keeps Spectator navigation restricted to Pekerjaan', () => {
    render(<Sidebar user={user(1)} />)
    expect(screen.getByRole('link', { name: 'Pekerjaan' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Master User' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Master Data' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Persetujuan' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Dashboard' })).toBeNull()
  })
  it('maintains a single current menu for the dashboard', () => {
    render(<Sidebar user={user(3)} />)
    expect(screen.getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')).toBe('page')
  })
  it('routes Manager master data to the user and category workspace', () => {
    render(<Sidebar user={user(3)} />)
    const masterUser = screen.getByRole('link', { name: 'Master User' })
    expect(masterUser.getAttribute('href')).toBe('/account')
  })
  it('shows personal workspace features to Staff/PIC', () => {
    render(<Sidebar user={user(2)} />)
    for (const label of ['Dashboard', 'Pekerjaan', 'Laporan', 'Master User', 'Master Data']) {
      expect(screen.getByRole('link', { name: label })).toBeTruthy()
    }
    expect(screen.queryByRole('link', { name: 'Akun' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Persetujuan' })).toBeNull()
  })
})
