'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  assignUserRole,
  decideUserRoleChange,
  inviteUser,
  proposeUserRoleChange,
  updateUserName,
  updateUserStatus,
} from '@/lib/users/actions'
import {
  isValidUserAssignment,
  requiredOrgUnitType,
  requiresSupervisor,
} from '@/lib/users/assignment'
import { isRoleName } from '@/lib/users/permissions'
import type {
  ManagedUser,
  PendingRoleChangeRequest,
  UserAssignmentOptions,
} from '@/lib/users/queries'
import type { UserActionResult } from '@/lib/users/actions'

type Props = {
  currentUserId: string
  currentUserRole: string
  users: ManagedUser[]
  assignmentOptions: UserAssignmentOptions | null
  pendingRoleChangeRequests: PendingRoleChangeRequest[]
}

export default function UserManagement({
  currentUserId,
  currentUserRole,
  users,
  assignmentOptions,
  pendingRoleChangeRequests,
}: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'semua' | 'aktif' | 'nonaktif'>('semua')
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null)
  const [editedName, setEditedName] = useState('')
  const [assignmentUser, setAssignmentUser] = useState<ManagedUser | null>(null)
  const [assignmentRoleId, setAssignmentRoleId] = useState('')
  const [assignmentOrgUnitId, setAssignmentOrgUnitId] = useState('')
  const [assignmentSupervisorId, setAssignmentSupervisorId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const canManageUsers = currentUserRole !== 'Manager'

  const filteredUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase()
    return users.filter((user) => {
      const matchesSearch = !normalizedSearch || [
        user.name,
        user.email,
        user.role,
        user.orgUnitName,
      ].some((value) => value.toLocaleLowerCase().includes(normalizedSearch))
      const matchesStatus = statusFilter === 'semua' || user.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [search, statusFilter, users])

  const selectedRole = assignmentOptions?.roles.find(
    ({ id }) => id.toString() === assignmentRoleId,
  )
  const assignmentPlacementLabel = selectedRole?.name === 'SM'
    ? 'Unit'
    : selectedRole?.name === 'Staff/PIC' || selectedRole?.name === 'Manager'
      ? 'Section'
      : selectedRole?.name === 'GM' || selectedRole?.name === 'Super Admin'
        ? 'Departemen'
        : 'Penempatan'
  const selectedOrgUnit = assignmentOptions?.orgUnits.find(
    ({ id }) => id.toString() === assignmentOrgUnitId,
  )
  const assignableOrgUnits = assignmentOptions?.orgUnits.filter((orgUnit) => {
    if (!selectedRole || !isRoleName(selectedRole.name)) return false
    const unitType = requiredOrgUnitType(selectedRole.name)
    return unitType === null || orgUnit.type === unitType
  }) ?? []
  const assignableSupervisors = assignmentOptions?.users.filter((candidate) => {
    if (
      !assignmentUser ||
      !selectedRole ||
      !isRoleName(selectedRole.name) ||
      !selectedOrgUnit ||
      !isRoleName(candidate.role) ||
      candidate.id === assignmentUser.id
    ) {
      return false
    }
    return isValidUserAssignment(
      selectedRole.name,
      selectedOrgUnit,
      { role: candidate.role, orgUnitId: candidate.orgUnitId, status: candidate.status },
      assignmentOptions.orgUnits,
    )
  }) ?? []

  async function finishAction(action: Promise<UserActionResult>) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await action
      if (result.ok) {
        setMessage(result.message)
        router.refresh()
        return true
      }
      setError(result.error)
      return false
    } catch {
      setError('Permintaan gagal diproses. Silakan coba lagi.')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function handleInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const succeeded = await finishAction(inviteUser({ name: inviteName, email: inviteEmail }))
    if (succeeded) {
      setInviteName('')
      setInviteEmail('')
      setInviteOpen(false)
    }
  }

  async function handleEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingUser) return
    const succeeded = await finishAction(
      updateUserName({ userId: editingUser.id, name: editedName }),
    )
    if (succeeded) setEditingUser(null)
  }

  async function handleAssignment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!assignmentUser) return

    const assignment = {
      userId: assignmentUser.id,
      roleId: Number(assignmentRoleId),
      orgUnitId: Number(assignmentOrgUnitId),
      supervisorId: assignmentSupervisorId || null,
    }
    const succeeded = await finishAction(currentUserRole === 'GM'
      ? proposeUserRoleChange(assignment)
      : assignUserRole(assignment))
    if (succeeded) setAssignmentUser(null)
  }

  async function handleRoleChangeDecision(requestId: string, decision: 'approved' | 'rejected') {
    await finishAction(decideUserRoleChange({ requestId, decision }))
  }

  async function handleStatusChange(user: ManagedUser) {
    const nextStatus = user.status === 'aktif' ? 'nonaktif' : 'aktif'
    const verb = nextStatus === 'nonaktif' ? 'menonaktifkan' : 'mengaktifkan kembali'
    if (!window.confirm(`Yakin ingin ${verb} ${user.name}?`)) return

    await finishAction(updateUserStatus({ userId: user.id, status: nextStatus }))
  }

  return (
    <section className="px-4 pt-5 pb-6 sm:px-6 lg:px-8" aria-labelledby="users-heading">
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 id="users-heading" className="text-xl font-bold tracking-tight text-slate-900">
            MASTER DATA USERS
          </h1>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="user-search"
            type="search"
            aria-label="Cari user"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari nama, email, role, atau unit"
            className="min-h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
          <select
            id="user-status-filter"
            value={statusFilter}
            aria-label="Filter status user"
            onChange={(event) => {
              const value = event.target.value
              if (value === 'semua' || value === 'aktif' || value === 'nonaktif') {
                setStatusFilter(value)
              }
            }}
            className="min-h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
          >
            <option value="semua">Semua status</option>
            <option value="aktif">Aktif</option>
            <option value="nonaktif">Nonaktif</option>
          </select>
          {canManageUsers && <button
            type="button"
            onClick={() => {
              setInviteOpen(true)
              setError(null)
              setMessage(null)
            }}
            className="min-h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
          >
            Tambah user
          </button>}
        </div>
      </header>


      {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
      {message && <p className="mb-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{message}</p>}

      {currentUserRole === 'Super Admin' && (
        <section className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="role-proposals-heading">
          <h2 id="role-proposals-heading" className="text-base font-bold text-slate-900">
            Usulan perubahan role
          </h2>
          {pendingRoleChangeRequests.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Tidak ada usulan yang menunggu keputusan.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {pendingRoleChangeRequests.map((request) => (
                <li key={request.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm">
                    <p className="font-semibold text-slate-900">{request.targetName}</p>
                    <p className="text-slate-600">
                      {request.roleName} · {request.orgUnitName}
                      {request.supervisorName ? ` · Atasan: ${request.supervisorName}` : ''}
                    </p>
                    <p className="text-xs text-slate-500">Diusulkan oleh {request.requesterName}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleRoleChangeDecision(request.id, 'approved')}
                      className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      Setujui
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleRoleChangeDecision(request.id, 'rejected')}
                      className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      Tolak
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[880px] border-collapse text-left text-sm">
          <caption className="sr-only">Daftar user dalam cakupan yang dapat dikelola</caption>
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">No</th>
              <th scope="col" className="px-4 py-3 font-semibold">Nama</th>
              <th scope="col" className="px-4 py-3 font-semibold">Email</th>
              <th scope="col" className="px-4 py-3 font-semibold">Role</th>
              <th scope="col" className="px-4 py-3 font-semibold">Unit / section</th>
              <th scope="col" className="px-4 py-3 font-semibold">Status</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredUsers.map((user, index) => (
              <tr key={user.id} className="hover:bg-slate-50/70">
                <td className="px-4 py-3 text-slate-500">{index + 1}</td>
                <td className="px-4 py-3 font-semibold text-slate-900">{user.name}</td>
                <td className="px-4 py-3 text-slate-600">{user.email}</td>
                <td className="px-4 py-3 text-slate-700">{user.role}</td>
                <td className="px-4 py-3 text-slate-700">{user.orgUnitName}</td>
                <td className="px-4 py-3">
                  <span className={[
                    'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                    user.role === 'Spectator' && user.status === 'aktif'
                      ? 'bg-amber-100 text-amber-900'
                      : user.status === 'aktif'
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'bg-slate-100 text-slate-600',
                  ].join(' ')}>
                    {user.role === 'Spectator' && user.status === 'aktif'
                      ? 'Menunggu role'
                      : user.status === 'aktif'
                        ? 'Aktif'
                        : 'Nonaktif'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {canManageUsers && user.id !== currentUserId && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setEditingUser(user)
                          setEditedName(user.name)
                          setError(null)
                          setMessage(null)
                        }}
                        className="rounded border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-60"
                      >
                        Edit nama
                      </button>
                    )}
                    {assignmentOptions && user.id !== currentUserId && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setAssignmentUser(user)
                          setAssignmentRoleId(
                            assignmentOptions.roles.find(({ name }) => name === user.role)?.id.toString() ?? '',
                          )
                          setAssignmentOrgUnitId(user.orgUnitId.toString())
                          setAssignmentSupervisorId(user.supervisorId ?? '')
                          setError(null)
                          setMessage(null)
                        }}
                        className="rounded border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-60"
                      >
                        {currentUserRole === 'GM' ? 'Usulkan role' : 'Ubah role'}
                      </button>
                    )}
                    {canManageUsers && user.id !== currentUserId && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleStatusChange(user)}
                        className="rounded border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-60"
                      >
                        {user.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">
                  {users.length === 0
                    ? 'Belum ada user pada cakupan ini.'
                    : 'Tidak ada user yang cocok dengan pencarian atau filter.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {inviteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setInviteOpen(false)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-user-title"
            className="w-full max-w-lg rounded-xl border border-slate-100 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="invite-user-title" className="text-lg font-bold text-slate-900">
                  Tambah user
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Undangan dikirim melalui email dan user baru dimulai sebagai Spectator.
                </p>
              </div>
              <button
                type="button"
                aria-label="Tutup dialog tambah user"
                disabled={busy}
                onClick={() => setInviteOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-60"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <form onSubmit={handleInvite} className="mt-5 space-y-4">
              <div>
                <label htmlFor="invite-name" className="mb-1 block text-sm font-medium text-slate-700">
                  Nama
                </label>
                <input
                  id="invite-name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={100}
                  value={inviteName}
                  onChange={(event) => setInviteName(event.target.value)}
                  className="min-h-10 w-full rounded-md border border-slate-300 px-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </div>
              <div>
                <label htmlFor="invite-email" className="mb-1 block text-sm font-medium text-slate-700">
                  Email undangan
                </label>
                <input
                  id="invite-email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  className="min-h-10 w-full rounded-md border border-slate-300 px-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setInviteOpen(false)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? 'Mengirim...' : 'Kirim undangan'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {editingUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setEditingUser(null)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-user-title"
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
          >
            <h2 id="edit-user-title" className="text-lg font-bold text-slate-900">Edit nama user</h2>
            <p className="mt-1 text-sm text-slate-500">{editingUser.email}</p>
            <form onSubmit={handleEdit} className="mt-5 space-y-4">
              <div>
                <label htmlFor="edited-user-name" className="mb-1 block text-sm font-medium text-slate-700">
                  Nama
                </label>
                <input
                  id="edited-user-name"
                  autoFocus
                  required
                  minLength={2}
                  maxLength={100}
                  value={editedName}
                  onChange={(event) => setEditedName(event.target.value)}
                  className="min-h-10 w-full rounded-md border border-slate-300 px-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setEditingUser(null)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {busy ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {assignmentUser && assignmentOptions && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setAssignmentUser(null)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="assign-role-title"
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-100 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="assign-role-title" className="text-lg font-bold text-slate-900">
                  {currentUserRole === 'GM' ? 'Usulkan perubahan role dan penempatan' : 'Ubah role user'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Tentukan role dan penempatan organisasi.
                </p>
              </div>
              <button
                type="button"
                aria-label="Tutup dialog ubah role"
                disabled={busy}
                onClick={() => setAssignmentUser(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-60"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <form onSubmit={handleAssignment} className="mt-5 space-y-4">
              <div>
                <label htmlFor="assignment-user-name" className="mb-1 block text-sm font-medium text-slate-700">
                  Nama
                </label>
                <input
                  id="assignment-user-name"
                  disabled
                  value={assignmentUser.name}
                  className="min-h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600"
                />
                <p className="mt-1 text-xs text-slate-500">{assignmentUser.email}</p>
              </div>
              <div>
                <label htmlFor="assignment-role" className="mb-1 block text-sm font-medium text-slate-700">
                  Role
                </label>
                <select
                  id="assignment-role"
                  required
                  value={assignmentRoleId}
                  onChange={(event) => {
                    const nextRoleId = event.target.value
                    const nextRole = assignmentOptions.roles.find(
                      ({ id }) => id.toString() === nextRoleId,
                    )
                    setAssignmentRoleId(nextRoleId)
                    setAssignmentSupervisorId('')
                    if (!nextRole || !isRoleName(nextRole.name)) return
                    const requiredType = requiredOrgUnitType(nextRole.name)
                    const currentUnit = assignmentOptions.orgUnits.find(
                      ({ id }) => id.toString() === assignmentOrgUnitId,
                    )
                    if (requiredType && currentUnit?.type !== requiredType) {
                      const firstEligibleUnit = assignmentOptions.orgUnits.find(
                        ({ type }) => type === requiredType,
                      )
                      setAssignmentOrgUnitId(firstEligibleUnit?.id.toString() ?? '')
                    }
                  }}
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                >
                  <option value="" disabled>Pilih role</option>
                  {assignmentOptions.roles.map((role) => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="assignment-unit" className="mb-1 block text-sm font-medium text-slate-700">
                  {assignmentPlacementLabel}
                </label>
                <select
                  id="assignment-unit"
                  required
                  value={assignmentOrgUnitId}
                  onChange={(event) => {
                    setAssignmentOrgUnitId(event.target.value)
                    setAssignmentSupervisorId('')
                  }}
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                >
                  <option value="" disabled>Pilih unit atau section</option>
                  {assignableOrgUnits.map((orgUnit) => (
                    <option key={orgUnit.id} value={orgUnit.id}>
                      {orgUnit.name} ({orgUnit.type})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="assignment-supervisor" className="mb-1 block text-sm font-medium text-slate-700">
                  Atasan langsung
                </label>
                <select
                  id="assignment-supervisor"
                  value={assignmentSupervisorId}
                  onChange={(event) => setAssignmentSupervisorId(event.target.value)}
                  required={Boolean(selectedRole && isRoleName(selectedRole.name) && requiresSupervisor(selectedRole.name))}
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                >
                  <option value="">
                    {selectedRole && isRoleName(selectedRole.name) && requiresSupervisor(selectedRole.name)
                      ? 'Pilih atasan'
                      : 'Tidak ditetapkan'}
                  </option>
                  {assignableSupervisors.map((supervisor) => (
                    <option key={supervisor.id} value={supervisor.id}>
                      {supervisor.name} · {supervisor.role}
                    </option>
                  ))}
                </select>
              </div>
              <p className="rounded-md border border-slate-100 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                {currentUserRole === 'GM'
                  ? 'Usulan akan ditinjau Super Admin; perubahan belum berlaku sampai disetujui.'
                  : 'Satu user hanya memiliki satu role dan satu penempatan. Perubahan dicatat di audit log.'}
                Role baru tidak otomatis memberi atau menghapus status login.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setAssignmentUser(null)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={busy || !assignmentRoleId || !assignmentOrgUnitId}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {busy
                    ? currentUserRole === 'GM' ? 'Mengirim...' : 'Menyimpan...'
                    : currentUserRole === 'GM' ? 'Kirim usulan' : 'Simpan'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  )
}
