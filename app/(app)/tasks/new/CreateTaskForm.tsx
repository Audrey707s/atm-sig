'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition, type FormEvent } from 'react'
import { createTask } from '@/lib/tasks/actions'
import type { TaskCreationOptions, TaskSupportRecipient } from '@/lib/tasks/queries'
import { toJakartaTimestamp } from '@/lib/tasks/dates'

type Props = TaskCreationOptions & { currentUserRoleLevel: number; currentUserId: string; supportRecipients: TaskSupportRecipient[] }

const inputClass = 'mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600'

function canAssignOwner(
  owner: TaskCreationOptions['owners'][number],
  section: TaskCreationOptions['sections'][number],
  currentUserRoleLevel: number,
) {
  if (owner.roleLevel >= 5) return currentUserRoleLevel >= 5
  if (owner.roleLevel === 4) return owner.orgUnitId === section.parentId
  return owner.orgUnitId === section.id
}

export default function CreateTaskForm({
  sections,
  owners,
  categories,
  supportRecipients,
  currentUserRoleLevel,
  currentUserId,
}: Props) {
  const router = useRouter()
  const [sectionId, setSectionId] = useState(String(sections[0]?.id ?? ''))
  const [ownerId, setOwnerId] = useState('')
  const [evidenceRequirements, setEvidenceRequirements] = useState<Array<{
    description: string
    mandatory: boolean
  }>>([])
  const [error, setError] = useState('')
  const [wbsItems, setWbsItems] = useState<Array<{title:string;weight:number;parentIndex:number|null}>>([])
  const [isPending, startTransition] = useTransition()
  const section = sections.find((item) => String(item.id) === sectionId)
  const eligibleOwners = section
    ? owners.filter((owner) => (currentUserRoleLevel !== 2 || owner.id === currentUserId) && canAssignOwner(owner, section, currentUserRoleLevel))
    : []
  const selectedOwner = eligibleOwners.find((owner) => owner.id === ownerId) ?? eligibleOwners[0]

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!section || !selectedOwner) {
      setError('Pilih section dan PIC yang memiliki reviewer aktif.')
      return
    }

    const formData = new FormData(event.currentTarget)
    const title = String(formData.get('title') ?? '')
    const startDate = String(formData.get('startDate') ?? '')
    const dueDate = String(formData.get('dueDate') ?? '')
    const priority = String(formData.get('priority') ?? '')
    const supportId = String(formData.get('supportId') ?? '')
    const supportDescription = String(formData.get('supportDescription') ?? '').trim()
    if (currentUserRoleLevel === 2 && (supportId && !supportDescription || !supportId && supportDescription)) {
      setError('Pilih penerima dan isi uraian untuk support awal.')
      return
    }

    const leafWeight=wbsItems.reduce((sum,item,index)=>wbsItems.some(other=>other.parentIndex===index)?sum:sum+item.weight,0)
    if(wbsItems.length && Math.abs(leafWeight-100)>0.01){setError('Jumlah bobot leaf WBS wajib 100%.');return}
    startTransition(async () => {
      const result = await createTask({
        title,
        ownerId: selectedOwner.id,
        reviewerId: selectedOwner.reviewerId,
        orgUnitId: section.id,
        parentTaskId: null,
        categoryId: String(formData.get('categoryId') ?? '') || null,
        priority: priority as 'rendah' | 'sedang' | 'tinggi',
        startDate: toJakartaTimestamp(startDate),
        dueDate: toJakartaTimestamp(dueDate, true),
        wbsItems: wbsItems.map(item=>({...item,title:item.title.trim()})),
        initialSupport: currentUserRoleLevel===2 && supportId && supportDescription ? [{neededFromId:supportId,description:supportDescription}]:[],
        evidenceRequirements: evidenceRequirements
          .map(({ description, mandatory }) => ({ description: description.trim(), mandatory }))
          .filter(({ description }) => description.length > 0),
      })

      if ('error' in result && result.error) {
        setError(result.error)
        return
      }
      if (!('data' in result) || !result.data) {
        setError('Task tidak berhasil dibuat. Silakan coba lagi.')
        return
      }

      router.push(`/tasks/${result.data.id}`)
      router.refresh()
    })
  }

  return (
    <section className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-5">
        <Link href="/tasks" className="text-sm font-medium text-red-700 hover:underline">
          ← Kembali ke daftar task
        </Link>
        <h1 className="mt-3 text-xl font-bold tracking-tight text-slate-900">BUAT TASK BARU</h1>
        <p className="mt-1 text-sm text-slate-500">Isi PIC, section, prioritas, dan timeline task.</p>
      </div>

      {sections.length === 0 ? (
        <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Tidak ada section dalam cakupan Anda yang dapat dipilih untuk task baru.
        </p>
      ) : (
        <form onSubmit={submit} className="grid gap-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <label className="text-sm font-medium text-slate-700">
            Judul task
            <input className={inputClass} name="title" required maxLength={200} />
          </label>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Section
              <select
                className={inputClass}
                value={sectionId}
                onChange={(event) => {
                  setSectionId(event.target.value)
                  setOwnerId('')
                }}
                required
              >
                {sections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              PIC
              <select
                className={inputClass}
                value={selectedOwner?.id ?? ''}
                onChange={(event) => setOwnerId(event.target.value)}
                required
                disabled={eligibleOwners.length === 0 || currentUserRoleLevel === 2}
              >
                {eligibleOwners.length === 0
                  ? <option value="">Tidak ada PIC yang dapat dipilih</option>
                  : eligibleOwners.map((owner) => (
                    <option key={owner.id} value={owner.id}>{owner.name}</option>
                  ))}
              </select>
            </label>
          </div>

          <label className="text-sm font-medium text-slate-700">
            Kategori task (opsional)
            <select name="categoryId" className={inputClass} defaultValue="">
              <option value="">Tanpa kategori</option>
              {categories.filter(category => category.orgUnitId === section?.id || category.orgUnitId === section?.parentId)
                .map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>

          {currentUserRoleLevel === 2 && supportRecipients.length > 0 && (
            <fieldset className="space-y-3 rounded-lg border border-slate-200 p-4">
              <legend className="px-1 text-sm font-semibold text-slate-700">Support awal (opsional)</legend>
              <p className="text-xs text-slate-500">Disimpan dalam transaksi yang sama bersama task dan WBS.</p>
              <label className="block text-sm text-slate-700">Dibutuhkan dari
                <select name="supportId" defaultValue="" className={inputClass}>
                  <option value="">Tidak memerlukan support</option>
                  {supportRecipients.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
                </select>
              </label>
              <label className="block text-sm text-slate-700">Penjelasan support
                <textarea name="supportDescription" maxLength={1000} rows={2} className={inputClass} placeholder="Dokumen atau bantuan yang dibutuhkan" />
              </label>
            </fieldset>
          )}

          {selectedOwner && (
            <p className="-mt-3 text-xs text-slate-500">
              Reviewer: {selectedOwner.reviewerName ?? 'Tidak diperlukan untuk task GM/Super Admin'}
            </p>
          )}

          <div className="grid gap-5 sm:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">
              Prioritas
              <select className={inputClass} name="priority" defaultValue="sedang">
                <option value="rendah">Rendah</option>
                <option value="sedang">Sedang</option>
                <option value="tinggi">Tinggi</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Tanggal mulai
              <input className={inputClass} type="date" name="startDate" required />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Tenggat
              <input className={inputClass} type="date" name="dueDate" required />
            </label>
          </div>

          <fieldset className="space-y-3 border-t border-slate-100 pt-4">
            <legend className="text-sm font-semibold text-slate-800">WBS awal (opsional, 2 tingkat)</legend>
            <p className="text-xs text-slate-500">Tambah root dahulu, lalu pilih induk. Total bobot leaf harus 100%.</p>
            {wbsItems.map((item,index)=>(
              <div key={index} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_100px_135px_auto]">
                <input aria-label={`Judul WBS ${index+1}`} required maxLength={200} value={item.title} className={inputClass}
                  onChange={event=>setWbsItems(items=>items.map((v,i)=>i===index?{...v,title:event.target.value}:v))} placeholder="Langkah pekerjaan" />
                <input aria-label={`Bobot WBS ${index+1}`} type="number" min="0" max="100" step="0.01" value={item.weight} className={inputClass}
                  onChange={event=>setWbsItems(items=>items.map((v,i)=>i===index?{...v,weight:Number(event.target.value)}:v))}/>
                <select aria-label={`Induk WBS ${index+1}`} className={inputClass} value={item.parentIndex??''}
                  onChange={event=>setWbsItems(items=>items.map((v,i)=>i===index?{...v,parentIndex:event.target.value===''?null:Number(event.target.value)}:v))}>
                  <option value="">Root</option>
                  {wbsItems.slice(0,index).map((parent,i)=>parent.parentIndex===null?<option key={i} value={i}>Di bawah {i+1}</option>:null)}
                </select>
                <button type="button" disabled={wbsItems.some(child=>child.parentIndex===index)}
                  onClick={()=>setWbsItems(items=>items.filter((_,i)=>i!==index).map(v=>({...v,parentIndex:v.parentIndex===null?null:v.parentIndex>index?v.parentIndex-1:v.parentIndex})))}
                  className="text-xs text-red-600 disabled:opacity-40">Hapus</button>
              </div>
            ))}
            <button type="button" disabled={wbsItems.length>=30} onClick={()=>setWbsItems(items=>[...items,{title:'',weight:0,parentIndex:null}])}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm">+ Tambah WBS</button>
          </fieldset>

          <fieldset className="grid gap-3 border-t border-slate-100 pt-4">
            <legend className="text-sm font-semibold text-slate-800">Evidence yang dibutuhkan</legend>
            <p className="text-sm text-slate-500">
              PIC perlu melampirkan evidence wajib sebelum task dapat dikirim untuk review.
            </p>
            {evidenceRequirements.map((requirement, index) => (
              <div key={index} className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                <label className="text-sm font-medium text-slate-700">
                  Deskripsi evidence
                  <input
                    className={inputClass}
                    value={requirement.description}
                    maxLength={200}
                    onChange={(event) => setEvidenceRequirements((current) => current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, description: event.target.value } : item,
                    ))}
                  />
                </label>
                <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={requirement.mandatory}
                    onChange={(event) => setEvidenceRequirements((current) => current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, mandatory: event.target.checked } : item,
                    ))}
                  />
                  Wajib
                </label>
                <button
                  type="button"
                  className="min-h-11 rounded-lg px-3 text-sm font-medium text-red-700 hover:bg-red-50"
                  onClick={() => setEvidenceRequirements((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  aria-label={`Hapus kebutuhan evidence ${index + 1}`}
                >
                  Hapus
                </button>
              </div>
            ))}
            <button
              type="button"
              className="min-h-11 justify-self-start rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => setEvidenceRequirements((current) => [...current, { description: '', mandatory: true }])}
            >
              Tambah kebutuhan evidence
            </button>
          </fieldset>

          {eligibleOwners.length === 0 && (
            <p role="alert" className="text-sm text-amber-800">
              Section ini belum memiliki PIC dengan reviewer aktif yang sesuai.
            </p>
          )}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

          <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-4">
            <Link href="/tasks" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Batal
            </Link>
            <button
              type="submit"
              disabled={isPending || eligibleOwners.length === 0}
              className="min-h-11 rounded-lg bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? 'Menyimpan…' : 'Buat Task'}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
