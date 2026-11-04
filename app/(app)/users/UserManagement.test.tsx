// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import UserManagement from './UserManagement'

const router = vi.hoisted(() => ({ refresh: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}))

vi.mock('@/lib/users/actions', () => ({
  assignUserRole: vi.fn(),
  decideUserRoleChange: vi.fn(),
  inviteUser: vi.fn(),
  proposeUserRoleChange: vi.fn(),
  updateUserName: vi.fn(),
  updateUserStatus: vi.fn(),
}))

const users = [
  {
    id: 'pic-id',
    name: 'Rina Accounting',
    email: 'rina@example.test',
    status: 'aktif' as const,
    role: 'Staff/PIC',
    orgUnitName: 'Cost Accounting',
    orgUnitId: 4,
    supervisorId: null,
  },
]

const assignmentOptions = {
  roles: [
    { id: 1, name: 'Spectator' },
    { id: 2, name: 'Staff/PIC' },
    { id: 3, name: 'Manager' },
    { id: 4, name: 'SM' },
    { id: 5, name: 'GM' },
    { id: 6, name: 'Super Admin' },
  ],
  orgUnits: [
    { id: 1, name: 'Accounting', type: 'department' as const, parentId: null },
    { id: 2, name: 'Unit of Accounting', type: 'unit' as const, parentId: 1 },
    { id: 4, name: 'Cost Accounting', type: 'section' as const, parentId: 2 },
  ],
  users: [
    { id: 'manager-id', name: 'Maya Manager', role: 'Manager', orgUnitId: 4, status: 'aktif' as const },
  ],
}

function renderUsers() {
  return render(
    <UserManagement
      currentUserId="admin-id"
      currentUserRole="Super Admin"
      users={users}
      assignmentOptions={assignmentOptions}
      pendingRoleChangeRequests={[]}
    />,
  )
}

describe('UserManagement (FR-003, FR-004, FR-005)', () => {
  afterEach(() => {
    cleanup()
    router.refresh.mockReset()
  })

  it('filters the user table by search text', () => {
    renderUsers()

    expect(screen.getByText('Rina Accounting')).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Cari user' }), {
      target: { value: 'missing' },
    })

    expect(screen.getByText('Tidak ada user yang cocok dengan pencarian atau filter.')).toBeTruthy()
    expect(screen.queryByText('Rina Accounting')).toBeNull()
  })

  it('opens and closes the add-user dialog from the page toolbar', () => {
    renderUsers()

    fireEvent.click(screen.getByRole('button', { name: 'Tambah user' }))
    expect(screen.getByRole('dialog', { name: 'Tambah user' })).toBeTruthy()
    expect(screen.getByLabelText('Email undangan')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Tutup dialog tambah user' }))
    expect(screen.queryByRole('dialog', { name: 'Tambah user' })).toBeNull()
  })

  it('opens the role and placement dialog for an eligible user', () => {
    renderUsers()

    fireEvent.click(screen.getByRole('button', { name: 'Ubah role' }))

    expect(screen.getByRole('dialog', { name: 'Ubah role user' })).toBeTruthy()
    expect(screen.getByLabelText('Role')).toBeTruthy()
    expect(screen.getByLabelText('Section')).toBeTruthy()
    expect(screen.getByDisplayValue('Rina Accounting')).toBeTruthy()
  })

  it('keeps Manager user data read-only', () => {
    render(<UserManagement currentUserId="manager-id" currentUserRole="Manager" users={users} assignmentOptions={null} pendingRoleChangeRequests={[]} />)
    expect(screen.getByText('Rina Accounting')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Tambah user' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit nama' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Nonaktifkan' })).toBeNull()
  })
})
