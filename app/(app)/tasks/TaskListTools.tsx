'use client'

import Link from 'next/link'
import { useState, useSyncExternalStore } from 'react'
import { safeTaskFilterQuery } from '@/lib/tasks/list-filters'

type Saved = { name: string; query: string }
function subscribe(callback: () => void) {
  window.addEventListener('storage', callback)
  window.addEventListener('atm-filters-updated', callback)
  return () => { window.removeEventListener('storage', callback); window.removeEventListener('atm-filters-updated', callback) }
}
const serverSnapshot = () => '[]'
function readSaved(raw: string): Saved[] {
  try {
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) ? value.filter((item): item is Saved =>
      typeof item?.name === 'string' && item.name.length <= 40 && typeof item?.query === 'string' && item.query.length <= 2000
    ).slice(0, 8).map(item => ({ name: item.name, query: safeTaskFilterQuery(item.query) })) : []
  } catch { return [] }
}
export default function TaskListTools({ userId, query, mine, roleLevel }: { userId: string; query: string; mine: boolean; roleLevel: number }) {
  const storageKey = `atm:task-filters:v1:${userId}`
  const raw = useSyncExternalStore(subscribe, () => {
    try { return localStorage.getItem(storageKey) ?? '[]' } catch { return '[]' }
  }, serverSnapshot)
  const saved = readSaved(raw)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  function persist(items: Saved[]) {
    try { localStorage.setItem(storageKey, JSON.stringify(items)); window.dispatchEvent(new Event('atm-filters-updated')); setMessage('Filter diperbarui di perangkat ini.') }
    catch { setMessage('Penyimpanan perangkat tidak tersedia. Gunakan alamat halaman untuk menyimpan filter.') }
  }
  const params = new URLSearchParams(query)
  function href(changes: Record<string, string>) {
    const next = new URLSearchParams(query)
    next.delete('page')
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    return `/tasks?${next}`
  }
  const reset = mine ? '/tasks?mine=1' : '/tasks'
  const button = 'rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-red-600'
  return <section className="mb-4 space-y-3" aria-label="Akses cepat tugas">
    <nav className="flex flex-wrap gap-2" aria-label="Tugas perlu tindakan">
      <Link className={button} href={reset}>Semua</Link>
      <Link className={button} href={href({ view: 'active', status: '' })}>Belum selesai</Link>
      <Link className={button} href={href({ view: 'overdue', status: '' })}>Terlambat</Link>
      <Link className={button} href={href({ view: '', status: 'Revisi' })}>Perlu revisi</Link>
      {roleLevel >= 3 && <Link className={button} href="/tasks?view=assigned-review">Review ditugaskan</Link>}
      {roleLevel >= 4 && <Link className={button} href="/approvals">Persetujuan tenggat</Link>}
    </nav>
    <form action="/tasks" className="flex flex-wrap items-center gap-2" role="search">
      {Array.from(params.entries()).filter(([key]) => !['search', 'page'].includes(key)).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
      <input name="search" type="search" maxLength={100} defaultValue={params.get('search') ?? ''} aria-label="Cari judul tugas" placeholder="Cari judul tugas…" className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm" />
      <button className={button}>Cari</button>
      <Link className={button} href={href({ density: params.get('density') === 'compact' ? '' : 'compact' })}>{params.get('density') === 'compact' ? 'Tampilan nyaman' : 'Tampilan ringkas'}</Link>
      <a className={button} href={`/tasks/calendar?${safeTaskFilterQuery(query)}`}>Ekspor kalender (.ics)</a>
      <a className={button} href={`/tasks/calendar?${safeTaskFilterQuery(query)}&format=csv`}>Ekspor CSV</a>
    </form>
    <div className="flex flex-wrap items-center gap-2">
      <input value={name} onChange={event => setName(event.target.value)} maxLength={40} aria-label="Nama filter tersimpan" placeholder="Nama filter" className="min-h-10 w-40 rounded-lg border border-slate-300 px-3 text-sm" />
      <button type="button" className={button} disabled={!name.trim()} onClick={() => {
        persist([...saved.filter(item => item.name !== name.trim()), { name: name.trim(), query: safeTaskFilterQuery(query) }].slice(-8)); setName('')
      }}>Simpan filter</button>
      {saved.map(item => <span key={item.name} className="inline-flex items-center rounded-lg border border-slate-300">
        <Link className="px-3 py-2 text-sm" href={`/tasks?${item.query}`}>{item.name}</Link>
        <button type="button" className="min-h-10 px-3 text-sm" aria-label={`Hapus filter ${item.name}`} onClick={() => persist(saved.filter(other => other.name !== item.name))}>×</button>
      </span>)}
    </div>
    <p role="status" className="text-xs text-slate-500">{message}</p>
  </section>
}
