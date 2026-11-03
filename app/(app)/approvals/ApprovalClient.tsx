'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { approveDeadlineChange } from '@/lib/tasks/actions'
import type { PendingDeadlineRequest } from '@/lib/tasks/queries'

type Props = { requests: PendingDeadlineRequest[] }

function formatDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value))
}

export default function ApprovalClient({ requests }: Props) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const [view, setView] = useState<'pending' | 'history'>('pending')
  const [month, setMonth] = useState('')
  const [taskSearch, setTaskSearch] = useState('')
  const [picSearch, setPicSearch] = useState('')
  const [section, setSection] = useState('')
  const [oldDeadline, setOldDeadline] = useState('')
  const [newDeadline, setNewDeadline] = useState('')
  const [appliedMonth, setAppliedMonth] = useState('')
  const [appliedTaskSearch, setAppliedTaskSearch] = useState('')
  const [appliedPicSearch, setAppliedPicSearch] = useState('')
  const [appliedSection, setAppliedSection] = useState('')
  const [appliedOldDeadline, setAppliedOldDeadline] = useState('')
  const [appliedNewDeadline, setAppliedNewDeadline] = useState('')
  const sections = Array.from(new Set(requests.map(request => request.orgUnitName))).sort((a,b)=>a.localeCompare(b,'id'))
  const visibleRequests = requests.filter(request => {
    if (view === 'pending' ? request.status !== 'Menunggu approval' : request.status === 'Menunggu approval') return false
    if (appliedMonth && request.createdAt.slice(0, 7) !== appliedMonth) return false
    if (appliedTaskSearch && !request.taskTitle.toLocaleLowerCase('id').includes(appliedTaskSearch.toLocaleLowerCase('id'))) return false
    if (appliedPicSearch && !request.requesterName.toLocaleLowerCase('id').includes(appliedPicSearch.toLocaleLowerCase('id'))) return false
    if (appliedSection && request.orgUnitName !== appliedSection) return false
    if (appliedOldDeadline && request.oldDueDate.slice(0,10) !== appliedOldDeadline) return false
    if (appliedNewDeadline && request.newDueDate.slice(0,10) !== appliedNewDeadline) return false
    return true
  })

  async function decide(requestId: string, decision: 'Disetujui' | 'Ditolak') {
    setBusyId(requestId)
    setFeedback('')
    try {
      const result = await approveDeadlineChange({ requestId, decision })
      if (typeof result.error === 'string') {
        setFeedback(result.error)
        return
      }
      if (!result.data) {
        setFeedback('Keputusan gagal disimpan. Silakan coba lagi.')
        return
      }
      setFeedback(decision === 'Disetujui' ? 'Pengajuan disetujui.' : 'Pengajuan ditolak.')
      router.refresh()
    } catch (error) {
      console.error('Deadline approval failed', error)
      setFeedback('Keputusan gagal disimpan. Silakan coba lagi.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          Approval Perubahan Deadline
        </h1>
      </header>

      {feedback && (
        <p role="status" aria-live="polite" className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          {feedback}
        </p>
      )}

      <nav aria-label="Filter pengajuan deadline" className="flex gap-2">
        <button type="button" aria-pressed={view === 'pending'} onClick={() => setView('pending')}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${view === 'pending' ? 'bg-[var(--color-brand-light)] text-[var(--color-brand)]' : 'text-[var(--color-text-secondary)]'}`}>
          Pending ({requests.filter(r => r.status === 'Menunggu approval').length})
        </button>
        <button type="button" aria-pressed={view === 'history'} onClick={() => setView('history')}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${view === 'history' ? 'bg-[var(--color-brand-light)] text-[var(--color-brand)]' : 'text-[var(--color-text-secondary)]'}`}>
          Riwayat ({requests.filter(r => r.status !== 'Menunggu approval').length})
        </button>
      </nav>
      <section aria-label="Daftar pengajuan deadline" className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold text-slate-900">Daftar Pengajuan Tenggat</h2>
          <div className="flex items-center gap-2">
            <button type="button" onClick={()=>{setAppliedMonth(month);setAppliedTaskSearch(taskSearch);setAppliedPicSearch(picSearch);setAppliedSection(section);setAppliedOldDeadline(oldDeadline);setAppliedNewDeadline(newDeadline)}} className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">Terapkan</button>
            <button type="button" onClick={()=>{setMonth('');setTaskSearch('');setPicSearch('');setSection('');setOldDeadline('');setNewDeadline('');setAppliedMonth('');setAppliedTaskSearch('');setAppliedPicSearch('');setAppliedSection('');setAppliedOldDeadline('');setAppliedNewDeadline('')}} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">Reset</button>
          </div>
        </div>
        {visibleRequests.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">
            Belum ada pengajuan perubahan deadline dalam cakupan Anda.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1240px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold" scope="col">Tanggal</th>
                  <th className="px-4 py-3 font-semibold" scope="col">Task</th>
                  <th className="px-4 py-3 font-semibold" scope="col">PIC</th>
                  <th className="px-4 py-3 font-semibold" scope="col">Seksi</th>
                  <th className="px-4 py-3 font-semibold" scope="col">Deadline lama</th>
                  <th className="px-4 py-3 font-semibold" scope="col">Deadline baru</th>
                  <th className="px-4 py-3 font-semibold" scope="col">Alasan</th>
                  <th className="px-4 py-3 font-semibold" scope="col">Status / Aksi</th>
                </tr>
                <tr className="border-t border-slate-200 bg-white align-top normal-case tracking-normal">
                  <th className="px-3 py-2"><input type="month" value={month} onChange={event=>setMonth(event.target.value)} aria-label="Filter bulan dan tahun" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs font-normal" /></th>
                  <th className="px-3 py-2"><input type="search" value={taskSearch} onChange={event=>setTaskSearch(event.target.value)} placeholder="Cari task" aria-label="Cari task" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs font-normal" /></th>
                  <th className="px-3 py-2"><input type="search" value={picSearch} onChange={event=>setPicSearch(event.target.value)} placeholder="Cari PIC" aria-label="Cari PIC" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs font-normal" /></th>
                  <th className="px-3 py-2"><select value={section} onChange={event=>setSection(event.target.value)} aria-label="Filter seksi" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs font-normal"><option value="">Semua seksi</option>{sections.map(name=><option key={name} value={name}>{name}</option>)}</select></th>
                  <th className="px-3 py-2"><input type="date" value={oldDeadline} onChange={event=>setOldDeadline(event.target.value)} aria-label="Filter deadline lama" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs font-normal" /></th>
                  <th className="px-3 py-2"><input type="date" value={newDeadline} onChange={event=>setNewDeadline(event.target.value)} aria-label="Filter deadline baru" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs font-normal" /></th>
                  <th className="px-3 py-2" aria-label="Tanpa filter alasan"></th>
                  <th className="px-3 py-2 text-[10px] font-normal text-slate-400">Sesuai status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRequests.map((request) => (
                  <tr key={request.id} className="align-top hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-4 text-slate-600">{formatDate(request.createdAt)}</td>
                    <td className="px-4 py-4 font-medium text-slate-900">{request.taskTitle}</td>
                    <td className="px-4 py-4 text-slate-600">{request.requesterName}</td>
                    <td className="px-4 py-4 text-slate-600">{request.orgUnitName}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate-600">{formatDate(request.oldDueDate)}</td>
                    <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-900">{formatDate(request.newDueDate)}</td>
                    <td className="max-w-xs whitespace-pre-wrap px-5 py-4 text-slate-600">{request.reason}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                        request.status === 'Menunggu approval'
                          ? 'bg-amber-100 text-amber-800'
                          : request.status === 'Disetujui'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-red-100 text-red-800'
                      }`}>
                        {request.status}
                      </span>
                      {request.status === 'Menunggu approval' ? (
                        <div className="mt-3 flex gap-2">
                          <button
                            className="rounded border border-red-600 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                            disabled={busyId !== null}
                            onClick={() => void decide(request.id, 'Ditolak')}
                            type="button"
                          >
                            Tolak
                          </button>
                          <button
                            className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                            disabled={busyId !== null}
                            onClick={() => void decide(request.id, 'Disetujui')}
                            type="button"
                          >
                            {busyId === request.id ? 'Menyimpan…' : 'Setujui'}
                          </button>
                        </div>
                      ) : (
                        <span className="mt-3 block text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <aside className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-500">
        Approver: SM, GM, atau Super Admin dalam cakupan organisasi. Keputusan dan waktu tercatat pada audit log.
      </aside>
    </main>
  )
}
