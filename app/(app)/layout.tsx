// Layout untuk semua halaman aplikasi (setelah login)
// Sesuai Stitch mockup: top header merah + sidebar putih kiri + konten kanan
// NFR-001: getSessionUser() memastikan hanya user terautentikasi yang masuk

import { getSessionUser } from '@/lib/auth/session'
import Sidebar from './_components/Sidebar'
import TaskDataSync from './_components/TaskDataSync'
import TopHeader from './_components/TopHeader'
import { getUnreadNotificationCount } from '@/lib/notifications/queries'
import { Suspense, type ReactNode } from 'react'
import type { Metadata } from 'next'
import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PROFILE_AVATAR_BUCKET, PROFILE_AVATAR_TTL_SECONDS } from '@/lib/account/avatar'

export const metadata: Metadata = {
  title: {
    template: '%s | ATM',
    default: 'Dashboard | ATM',
  },
}

async function AuthenticatedAppLayout({ children }: { children: ReactNode }) {
  // This authenticated shell includes request-specific values (session and current time).
  // Keep it out of the static prerender so client components can safely render relative time.
  await connection()
  const user = await getSessionUser()
  const supabase = await createClient()
  // Optional shell data must not prevent the primary workspace from loading.
  const [unreadCount, avatar] = await Promise.all([
    getUnreadNotificationCount(user.id).catch(() => 0),
    supabase.storage.from(PROFILE_AVATAR_BUCKET).createSignedUrl(`${user.id}/avatar`, PROFILE_AVATAR_TTL_SECONDS).then(({ data }) => data?.signedUrl ?? '').catch(() => ''),
  ])

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Top Header merah */}
      <TopHeader user={user} unreadCount={unreadCount} avatarUrl={avatar} />
      <TaskDataSync />

      {/* Konten: Sidebar + Main */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        <Sidebar user={user} />
        <main className="atm-workspace min-h-0 min-w-0 flex-1 overflow-y-auto bg-[var(--color-bg-app)]">
          {children}
        </main>
      </div>
    </div>
  )
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div role="status" className="flex h-full items-center justify-center text-sm text-gray-500">
          Memuat sesi...
        </div>
      }
    >
      <AuthenticatedAppLayout>{children}</AuthenticatedAppLayout>
    </Suspense>
  )
}
