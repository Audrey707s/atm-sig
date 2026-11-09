import type { Metadata } from 'next'
import { getSessionUser } from '@/lib/auth/session'
import {
  getNotifications,
  getUnreadNotificationCount,
} from '@/lib/notifications/queries'
import NotificationInbox from './NotificationInbox'
import PushPermissionButton from '@/components/push-permission-button'

export const metadata: Metadata = { title: 'Notifikasi' }

export default async function NotificationsPage() {
  const user = await getSessionUser()
  let initialData
  try {
    const [page, unreadCount] = await Promise.all([
      getNotifications(user.id),
      getUnreadNotificationCount(user.id),
    ])
    initialData = {
      initialItems: page.items,
      initialHasMore: page.hasMore,
      initialUnreadCount: unreadCount,
    }
  } catch {
    return (
      <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div role="alert" className="rounded-xl border border-red-200 bg-white p-6">
          <h1 className="text-lg font-semibold text-slate-900">Notifikasi gagal dimuat</h1>
          <p className="mt-2 text-sm text-slate-600">
            Notifikasi belum dapat dimuat. Muat ulang halaman atau coba lagi nanti.
          </p>
          <a
            href="/notifications"
            className="mt-4 inline-flex rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
          >
            Coba lagi
          </a>
        </div>
      </section>
    )
  }

  return <section className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6"><div className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="mb-2 font-semibold">Notifikasi perangkat</h2><PushPermissionButton /></div><NotificationInbox {...initialData} /></section>
}
