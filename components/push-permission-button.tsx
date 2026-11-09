'use client'

import { useEffect, useState } from 'react'

function decodeVapidKey(key: string) {
  const normalized = (key + '='.repeat((4 - key.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(normalized), char => char.charCodeAt(0))
}

/**
 * register() may return an installing/waiting worker. PushManager.subscribe()
 * requires an ACTIVE worker, so wait for activation before subscribing.
 */
async function getActiveRegistration(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  if (registration.active?.state === 'activated') return registration

  const worker = registration.installing ?? registration.waiting ?? registration.active
  if (!worker) throw new Error('Notifikasi belum siap. Muat ulang halaman lalu coba lagi.')
  if (worker.state === 'activated') return registration
  // Capture the non-null worker in a separate binding for async callbacks.
  const activeCandidate: ServiceWorker = worker

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      activeCandidate.removeEventListener('statechange', onStateChange)
      reject(new Error('Persiapan notifikasi terlalu lama. Muat ulang halaman dan coba lagi.'))
    }, 15000)
    function onStateChange() {
      if (activeCandidate.state === 'activated') {
        clearTimeout(timeout)
        activeCandidate.removeEventListener('statechange', onStateChange)
        resolve()
      } else if (activeCandidate.state === 'redundant') {
        clearTimeout(timeout)
        activeCandidate.removeEventListener('statechange', onStateChange)
        reject(new Error('Notifikasi gagal disiapkan. Muat ulang halaman.'))
      }
    }
    activeCandidate.addEventListener('statechange', onStateChange)
    onStateChange()
  })
  return registration
}

type State = 'checking' | 'unsupported' | 'blocked' | 'not-subscribed' | 'subscribed' | 'error'

export default function PushPermissionButton() {
  const [state, setState] = useState<State>('checking')
  const [message, setMessage] = useState('Memeriksa notifikasi perangkat…')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function check() {
      if (!window.isSecureContext || !('Notification' in window) ||
          !('serviceWorker' in navigator) || !('PushManager' in window)) {
        if (!cancelled) { setState('unsupported'); setMessage('Browser ini belum mendukung notifikasi perangkat. Gunakan browser yang mendukung notifikasi.') }
        return
      }
      if (Notification.permission === 'denied') {
        if (!cancelled) { setState('blocked'); setMessage('Notifikasi diblokir. Ubah izin notifikasi di pengaturan browser atau perangkat.') }
        return
      }
      try {
        const registration = await getActiveRegistration()
        const subscription = await registration.pushManager.getSubscription()
        if (cancelled) return
        setState(subscription ? 'subscribed' : 'not-subscribed')
        setMessage(subscription
          ? 'Notifikasi sudah diizinkan pada perangkat ini. Tekan Aktifkan untuk menghubungkannya dengan akun Anda.'
          : 'Perangkat belum terdaftar. Tekan Aktifkan untuk mulai menerima notifikasi.')
      } catch {
        if (!cancelled) { setState('error'); setMessage('Notifikasi belum dapat disiapkan. Periksa koneksi, lalu muat ulang halaman.') }
      }
    }
    void check()
    return () => { cancelled = true }
  }, [])

  async function subscribe() {
    if (busy) return
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!key || key.length < 60) {
      setState('error')
      setMessage('Layanan notifikasi belum siap. Hubungi administrator.')
      return
    }
    if (!('Notification' in window) || !('serviceWorker' in navigator) ||
        !('PushManager' in window) || !window.isSecureContext) {
      setState('unsupported')
      setMessage('Notifikasi belum didukung pada browser atau perangkat ini.')
      return
    }
    setBusy(true)
    try {
      if (await Notification.requestPermission() !== 'granted') {
        setState('blocked')
        setMessage('Izin notifikasi ditolak. Aktifkan izin notifikasi ATM di pengaturan browser atau perangkat.')
        return
      }
      const registration = await getActiveRegistration()
      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidKey(key),
        })
      }
      const response = await fetch('/api/push/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      })
      if (!response.ok) {
        throw new Error('Pendaftaran notifikasi ditolak.')
      }
      setState('subscribed')
      setMessage('Notifikasi berhasil diaktifkan. Perangkat ini akan menerima notifikasi baru untuk akun Anda.')
    } catch {
      setState('error')
      setMessage('Notifikasi belum dapat diaktifkan. Periksa koneksi dan izin notifikasi, lalu coba lagi.')
    } finally {
      setBusy(false)
    }
  }

  async function testLocalNotification() {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      setMessage('Izinkan notifikasi pada perangkat terlebih dahulu sebelum mencoba tes.')
      return
    }
    try {
      const registration = await getActiveRegistration()
      await registration.showNotification('Tes notifikasi ATM', {
        body: 'Notifikasi ATM berhasil ditampilkan pada perangkat ini.',
        icon: '/icon.svg',
        tag: 'atm-local-test',
      })
      setMessage('Tes telah dikirim. Periksa panel notifikasi perangkat Anda.')
    } catch {
      setState('error')
      setMessage('Tes notifikasi gagal. Periksa izin notifikasi, lalu coba lagi.')
    }
  }

  async function unsubscribe() {
    if (busy || !('serviceWorker' in navigator)) return
    setBusy(true)
    try {
      const registration = await getActiveRegistration()
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        const response = await fetch('/api/push/subscription', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        })
        if (!response.ok) throw new Error('Server gagal menghapus perangkat (' + response.status + ')')
        await subscription.unsubscribe()
      }
      setState('not-subscribed')
      setMessage('Notifikasi perangkat sudah dinonaktifkan.')
    } catch {
      setState('error')
      setMessage('Notifikasi belum dapat dinonaktifkan. Periksa koneksi, lalu coba lagi.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div role="status" aria-live="polite" className="text-sm text-slate-700">
        <span className="font-semibold">Status perangkat: </span>{message}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || state === 'unsupported'}
          onClick={subscribe}
          className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50">
          {busy ? 'Memproses…' : 'Aktifkan notifikasi perangkat'}
        </button>
        <button type="button" disabled={busy || state === 'unsupported'}
          onClick={testLocalNotification}
          className="rounded-md border border-blue-300 px-4 py-2 text-sm font-medium text-blue-800 hover:bg-blue-50 disabled:opacity-50">
          Tes notifikasi perangkat
        </button>
        <button type="button" disabled={busy || state === 'unsupported'}
          onClick={unsubscribe}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50">
          Nonaktifkan
        </button>
      </div>
      {state === 'subscribed' && <p className="text-xs text-slate-500">
        Perangkat menerima notifikasi baru setelah diaktifkan. Notifikasi sebelumnya tetap tersedia di kotak masuk aplikasi.
      </p>}
    </div>
  )
}
