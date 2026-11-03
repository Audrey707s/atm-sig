// Layout untuk semua halaman aplikasi (setelah login)
// Sesuai Stitch mockup: top header merah + sidebar putih kiri + konten kanan
// NFR-001: getSessionUser() memastikan hanya user terautentikasi yang masuk

import { getSessionUser } from '@/lib/auth/session'
import Sidebar from './_components/Sidebar'
import TopHeader from './_components/TopHeader'
import { getUnreadNotificationCount } from '@/lib/notifications/queries'
import { Suspense, type ReactNode } from 'react'
import type { Metadata } from 'next'
import { connection } from 'next/server'

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
  // Notification availability must not prevent the primary workspace from loading.
  const unreadCount = await getUnreadNotificationCount(user.id).catch(() => 0)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Top Header merah */}
      <TopHeader user={user} unreadCount={unreadCount} />

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
