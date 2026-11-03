'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  loadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/notifications/actions'
import type { NotificationItem } from '@/lib/notifications/queries'
import { REMINDER_RESPONSES, type ReminderResponse } from '@/lib/reminders/responses'
import { respondToReminder } from '@/lib/tasks/actions'

type Props = {
  initialItems: NotificationItem[]
  initialHasMore: boolean
  initialUnreadCount: number
}

type Filter = 'all' | 'unread'

function relativeTime(value: string, now: number) {
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return 'Waktu tidak tersedia'

  const seconds = Math.round((timestamp - now) / 1000)
  const formatter = new Intl.RelativeTimeFormat('id-ID', { numeric: 'auto' })
  if (Math.abs(seconds) < 60) return formatter.format(0, 'second')
  if (Math.abs(seconds) < 3600) return formatter.format(Math.round(seconds / 60), 'minute')
  if (Math.abs(seconds) < 86_400) return formatter.format(Math.round(seconds / 3600), 'hour')
  return formatter.format(Math.round(seconds / 86_400), 'day')
}

function NotificationIcon({ type }: { type: string }) {
  const isReminder = type.startsWith('reminder_')
  const isProgress = type === 'task_progress_updated'
  const classes = isReminder
    ? 'bg-emerald-100 text-emerald-600'
    : isProgress
      ? 'bg-indigo-100 text-indigo-600'
      : 'bg-amber-100 text-amber-600'

  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${classes}`} aria-hidden="true">
      {isReminder ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-5 w-5">
          <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : isProgress ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
          <path d="M4 11a8 8 0 1 1 2.34 5.66M4 4v7h7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  )
}

export default function NotificationInbox({
  initialItems,
  initialHasMore,
  initialUnreadCount,
}: Props) {
  const router = useRouter()
  const [items, setItems] = useState(initialItems)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)
  const [filter, setFilter] = useState<Filter>('all')
  const [feedback, setFeedback] = useState('')
  const [isPending, startTransition] = useTransition()
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    const updateTime = () => setNow(Date.now())
    updateTime()
    const intervalId = window.setInterval(updateTime, 60_000)
    return () => window.clearInterval(intervalId)
  }, [])

  function updateReadState(notificationId: string, readAt: string) {
    setItems((current) => unreadOnly
      ? current.filter((item) => item.id !== notificationId)
      : current.map((item) => (
        item.id === notificationId ? { ...item, readAt } : item
      )))
    setUnreadCount((current) => Math.max(0, current - 1))
  }

  function markRead(notificationId: string) {
    startTransition(async () => {
      setFeedback('')
      const result = await markNotificationRead(notificationId)
      if ('error' in result && result.error) {
        setFeedback(result.error)
        return
      }
      if (!('data' in result) || !result.data) {
        setFeedback('Gagal menandai notifikasi sebagai dibaca.')
        return
      }
      const item = items.find((notification) => notification.id === notificationId)
      if (item?.readAt === null) updateReadState(notificationId, result.data.readAt)
    })
  }

  function markAllRead() {
    startTransition(async () => {
      setFeedback('')
      const result = await markAllNotificationsRead()
      if ('error' in result && result.error) {
        setFeedback(result.error)
        return
      }
      if (!('data' in result) || !result.data) {
        setFeedback('Gagal menandai semua notifikasi sebagai dibaca.')
        return
      }
      setItems((current) => current.map((item) => (
        item.readAt === null ? { ...item, readAt: result.data.readAt } : item
      )))
      setUnreadCount(0)
      if (filter === 'unread') {
        setItems([])
        setHasMore(false)
      }
    })
  }

  function selectFilter(nextFilter: Filter) {
    if (nextFilter === filter) return
    startTransition(async () => {
      setFeedback('')
      const result = await loadNotifications(0, nextFilter === 'unread')
      setFilter(nextFilter)
      if ('error' in result && result.error) {
        setItems([])
        setHasMore(false)
        setFeedback(result.error)
        return
      }
      if (!('data' in result) || !result.data) {
        setItems([])
        setHasMore(false)
        setFeedback('Gagal memuat notifikasi.')
        return
      }
      setItems(result.data.items)
      setHasMore(result.data.hasMore)
    })
  }

  function loadMore() {
    startTransition(async () => {
      setFeedback('')
      const result = await loadNotifications(items.length, filter === 'unread')
      if ('error' in result && result.error) {
        setFeedback(result.error)
        return
      }
      if (!('data' in result) || !result.data) {
        setFeedback('Gagal memuat notifikasi.')
        return
      }
      setItems((current) => [...current, ...result.data.items])
      setHasMore(result.data.hasMore)
    })
  }

  function respond(notification: NotificationItem, response: ReminderResponse) {
    const reminderId = notification.reminderId
    if (!reminderId) return
    startTransition(async () => {
      setFeedback('')
      const result = await respondToReminder({
        reminderId,
        response,
      })
      if ('error' in result && result.error) {
        setFeedback(result.error)
        return
      }
      if (!('data' in result) || !result.data) {
        setFeedback('Gagal mengirim tanggapan reminder.')
        return
      }
      setItems((current) => current.map((item) => (
        item.id === notification.id ? { ...item, reminderResponse: response } : item
      )))
      if (notification.taskId) router.push(`/tasks/${notification.taskId}`)
    })
  }

  const unreadOnly = filter === 'unread'

  return (
    <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">NOTIFIKASI</h1>
        </div>
        <button
          type="button"
          onClick={markAllRead}
          disabled={isPending || unreadCount === 0}
          className="self-start rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Tandai semua dibaca
        </button>
      </div>

      <div className="mb-4 flex gap-2" aria-label="Filter notifikasi">
        <button
          type="button"
          aria-pressed={!unreadOnly}
          onClick={() => selectFilter('all')}
          className={`rounded-full px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 ${
            !unreadOnly ? 'bg-red-50 text-red-700' : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          Semua
        </button>
        <button
          type="button"
          aria-pressed={unreadOnly}
          onClick={() => selectFilter('unread')}
          className={`rounded-full px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 ${
            unreadOnly ? 'bg-red-50 text-red-700' : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          Belum dibaca ({unreadCount})
        </button>
      </div>

      {feedback && (
        <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {feedback}
        </p>
      )}

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <p className="text-sm font-medium text-slate-700">
            {unreadOnly ? 'Tidak ada notifikasi yang belum dibaca.' : 'Belum ada notifikasi.'}
          </p>
        </div>
      ) : (
        <ul aria-label="Daftar notifikasi" aria-busy={isPending} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {items.map((item) => (
            <li
              key={item.id}
              className={`flex flex-col gap-3 border-b border-slate-100 px-4 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:px-6 ${
                item.readAt === null ? 'bg-[#FFF8F8]' : 'bg-white'
              }`}
            >
              <div className="flex min-w-0 items-start gap-4">
                <NotificationIcon type={item.type} />
                <div className="min-w-0 text-sm">
                  <h2 className={`font-semibold ${item.readAt === null ? 'text-slate-900' : 'text-slate-700'}`}>
                    {item.title}
                  </h2>
                  <p className="mt-0.5 break-words text-slate-600">{item.body}</p>
                  {item.taskId && (
                    <Link
                      href={`/tasks/${item.taskId}`}
                      onClick={() => {
                        if (item.readAt === null) markRead(item.id)
                      }}
                      className="mt-2 inline-block text-xs font-medium text-red-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                    >
                      Buka task
                    </Link>
                  )}
                  {item.reminderId && item.reminderResponse === null && item.type.startsWith('reminder_') && (
                    <div className="mt-3 flex flex-wrap gap-2" aria-label="Tanggapi reminder">
                      {REMINDER_RESPONSES.map((response) => (
                        <button
                          key={response}
                          type="button"
                          disabled={isPending}
                          onClick={() => respond(item, response)}
                          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-red-300 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-50"
                        >
                          {response}
                        </button>
                      ))}
                    </div>
                  )}
                  {item.reminderResponse && (
                    <p className="mt-2 text-xs font-medium text-emerald-700">
                      Tanggapan Anda: {item.reminderResponse}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center justify-between gap-3 pl-14 sm:justify-end sm:pl-0">
                <time dateTime={item.sentAt} className="text-xs text-slate-500">
                  {now === null ? 'Memuat waktu...' : relativeTime(item.sentAt, now)}
                </time>
                {item.readAt === null ? (
                  <button
                    type="button"
                    onClick={() => markRead(item.id)}
                    disabled={isPending}
                    aria-label={`Tandai "${item.title}" sudah dibaca`}
                    className="h-3 w-3 rounded-full bg-red-600 ring-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-50"
                  />
                ) : (
                  <span className="h-3 w-3" aria-label="Sudah dibaca" />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={isPending}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-50"
          >
            {isPending ? 'Memuat...' : 'Muat notifikasi lainnya'}
          </button>
        </div>
      )}
    </section>
  )
}
