import WorkspaceTabs, { MASTER_USER_TABS } from '../_components/WorkspaceTabs'
import type { Metadata } from 'next'
import { getSessionUser } from '@/lib/auth/session'
import { ROLE_LEVELS, ROLES } from '@/lib/constants/rbac'
import {
  getManagedUsers,
  getPendingRoleChangeRequests,
  getUserAssignmentOptions,
} from '@/lib/users/queries'
import UserManagement from './UserManagement'

export const metadata: Metadata = {
  title: 'Organisasi Pengguna',
}

export default async function UsersPage() {
  const user = await getSessionUser()

  if (user.roleLevel < ROLE_LEVELS.Manager) {
    return (
      <section className="p-6 sm:p-8" aria-labelledby="users-heading">
        <h1 id="users-heading" className="text-xl font-bold text-slate-900">
          Organisasi Pengguna
        </h1>
        <p className="mt-3 text-sm text-slate-600" role="alert">
          Anda tidak berwenang mengakses data pengguna.
        </p>
      </section>
    )
  }

  const data = await (async () => {
    // Tiga sumber data ini independen — jalankan paralel.
    const [users, assignmentOptions, pendingRoleChangeRequests] = await Promise.all([
      getManagedUsers(),
      user.role === ROLES.SUPER_ADMIN || user.role === ROLES.GM
        ? getUserAssignmentOptions()
        : Promise.resolve(null),
      user.role === ROLES.SUPER_ADMIN
        ? getPendingRoleChangeRequests()
        : Promise.resolve([]),
    ])
    return { users, assignmentOptions, pendingRoleChangeRequests }
  })().catch(() => null)

  if (!data) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div role="alert" className="rounded-xl border border-red-200 bg-white p-6">
          <h1 className="text-lg font-semibold text-slate-900">Data user gagal dimuat</h1>
          <p className="mt-2 text-sm text-slate-600">
            Data user atau usulan perubahan role tidak dapat dibaca. Periksa koneksi database dan migrasi Supabase, lalu coba lagi.
          </p>
          <a
            href="/users"
            className="mt-4 inline-flex rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
          >
            Coba lagi
          </a>
        </div>
      </section>
    )
  }

  return (
    <><div className="px-4 pt-5 sm:px-6 lg:px-8"><WorkspaceTabs current="/users" tabs={MASTER_USER_TABS} roleLevel={user.roleLevel} /></div><UserManagement
      currentUserId={user.id}
      currentUserRole={user.role}
      users={data.users}
      assignmentOptions={data.assignmentOptions}
      pendingRoleChangeRequests={data.pendingRoleChangeRequests}
    /></>
  )
}
