'use client'

// FR-100 / CR-0003: master kategori dan jadwal template dengan status hasil action server.

import { useActionState, useState } from 'react'
import {
  deleteTaskCategory,
  deleteTaskTemplate,
  saveTaskCategory,
  saveTaskTemplate,
  toggleTaskTemplate,
  type MasterActionState,
} from '@/lib/task-masters/actions'
import type { MasterPerson, MasterSection, TaskCategory, TaskTemplate } from '@/lib/task-masters/queries'

const initialState: MasterActionState = { ok: false, message: '' }

function Feedback({ state }: { state: MasterActionState }) {
  if (!state.message) return null
  return <p role="status" className={`mt-2 text-xs ${state.ok ? 'text-emerald-700' : 'text-red-700'}`}>{state.message}</p>
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5 text-xs font-semibold text-slate-600">{label}{children}</label>
}

const inputClass = 'min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800 shadow-sm focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600'
const buttonClass = 'inline-flex min-h-10 items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-60'
const secondaryClass = 'inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60'

function CategoryForm({ category, sections }: { category?: TaskCategory; sections: MasterSection[] }) {
  const [state, action, pending] = useActionState(saveTaskCategory, initialState)
  return (
    <form action={action} className={category ? 'grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end' : 'grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end'}>
      {category && <input type="hidden" name="id" value={category.id} />}
      {category && <input type="hidden" name="org_unit_id" value={category.orgUnitId} />}
      <FormField label="Nama kategori">
        <input className={inputClass} name="name" required maxLength={80} defaultValue={category?.name ?? ''} placeholder="Contoh: Rekonsiliasi" />
      </FormField>
      <FormField label="Section">
        <select className={inputClass} name={category ? undefined : 'org_unit_id'} required={!category} disabled={Boolean(category)} defaultValue={category?.orgUnitId ?? ''}>
          <option value="" disabled>Pilih section</option>
          {sections.map((section) => <option key={section.id} value={section.id}>{section.unitName} · {section.name}</option>)}
        </select>
      </FormField>
      {category && <FormField label="Status">
        <select className={inputClass} name="is_active" defaultValue={String(category.isActive)}>
          <option value="true">Aktif</option><option value="false">Nonaktif</option>
        </select>
      </FormField>}
      <button className={buttonClass} disabled={pending}>{pending ? 'Menyimpan…' : category ? 'Simpan perubahan' : 'Tambah kategori'}</button>
      <div className="sm:col-span-full"><Feedback state={state} /></div>
    </form>
  )
}

function CategoryDelete({ category }: { category: TaskCategory }) {
  const [state, action, pending] = useActionState(deleteTaskCategory, initialState)
  return (
    <form action={action} className="mt-3 flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={category.id} />
      <button className={secondaryClass} disabled={pending}>Hapus kategori</button>
      <Feedback state={state} />
    </form>
  )
}

function eligibleOwners(people: MasterPerson[], section: MasterSection, canAssignGlobalOwner: boolean, ownerSelectionUserId: string | null) {
  return people.filter((person) => {
    if (ownerSelectionUserId) return person.id === ownerSelectionUserId
    if (person.roleLevel >= 5) return canAssignGlobalOwner
    if (person.roleLevel === 4) return person.orgUnitId === section.parentId
    return person.orgUnitId === section.id
  })
}

function TemplateForm({
  section,
  category,
  people,
  canAssignGlobalOwner,
  ownerSelectionUserId,
  template,
}: {
  section: MasterSection
  category: TaskCategory
  people: MasterPerson[]
  canAssignGlobalOwner: boolean
  ownerSelectionUserId: string | null
  template?: TaskTemplate
}) {
  const [state, action, pending] = useActionState(saveTaskTemplate, initialState)
  const [ownerId, setOwnerId] = useState(template?.ownerId ?? '')
  const [reviewerId, setReviewerId] = useState(template?.reviewerId ?? '')
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>(template?.recurrence ?? 'weekly')
  const owners = eligibleOwners(people, section, canAssignGlobalOwner, ownerSelectionUserId)
  const selectedOwner = people.find((person) => person.id === ownerId)
  const reviewers = selectedOwner?.roleLevel && selectedOwner.roleLevel >= 5
    ? []
    : selectedOwner?.supervisorId
      ? people.filter((person) => person.id === selectedOwner.supervisorId)
      : []
  const selectedReviewerId = reviewers.some((person) => person.id === reviewerId)
    ? reviewerId
    : reviewers[0]?.id ?? ''

  return (
    <form action={action} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 xl:grid-cols-4">
      {template && <input type="hidden" name="id" value={template.id} />}
      <input type="hidden" name="org_unit_id" value={section.id} />
      <input type="hidden" name="category_id" value={category.id} />
      <FormField label="Nama template"><input className={inputClass} name="name" required maxLength={100} defaultValue={template?.name ?? ''} placeholder="Mis. Rekonsiliasi bulanan" /></FormField>
      <FormField label="Judul task yang dibuat"><input className={inputClass} name="title" required maxLength={200} defaultValue={template?.title ?? ''} placeholder="Judul task" /></FormField>
      <FormField label="PIC">
        <select className={inputClass} name="owner_id" required value={ownerId} onChange={(event) => {
          const nextOwnerId = event.target.value
          setOwnerId(nextOwnerId)
          setReviewerId(people.find((person) => person.id === nextOwnerId)?.supervisorId ?? '')
        }}>
          <option value="">Pilih PIC</option>
          {owners.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select>
      </FormField>
      <FormField label="Reviewer">
        <select className={inputClass} name="reviewer_id" value={selectedReviewerId} onChange={(event) => setReviewerId(event.target.value)}>
          <option value="">{selectedOwner?.roleLevel && selectedOwner.roleLevel >= 5 ? 'Tanpa reviewer (GM/Super Admin)' : 'Pilih PIC untuk menentukan atasan'}</option>
          {reviewers.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select>
      </FormField>
      <FormField label="Prioritas">
        <select className={inputClass} name="priority" defaultValue={template?.priority ?? 'sedang'}>
          <option value="rendah">Rendah</option><option value="sedang">Sedang</option><option value="tinggi">Tinggi</option>
        </select>
      </FormField>
      <FormField label="Frekuensi">
        <select className={inputClass} name="recurrence" value={frequency} onChange={(event) => setFrequency(event.target.value as 'weekly' | 'monthly')}>
          <option value="weekly">Mingguan</option><option value="monthly">Bulanan</option>
        </select>
      </FormField>
      <FormField label={frequency === 'weekly' ? 'Hari (1 Senin – 7 Minggu)' : 'Tanggal (1–31, menyesuaikan akhir bulan)'}>
        <input className={inputClass} type="number" name="recurrence_day" min={1} max={frequency === 'weekly' ? 7 : 31} required defaultValue={template?.recurrenceDay ?? 1} />
      </FormField>
      <FormField label="Mulai setelah tanggal jadwal (hari)">
        <input className={inputClass} type="number" name="start_offset_days" min={0} max={365} required defaultValue={template?.startOffsetDays ?? 0} />
      </FormField>
      <FormField label="Tenggat setelah tanggal jadwal (hari)">
        <input className={inputClass} type="number" name="due_offset_days" min={1} max={366} required defaultValue={template?.dueOffsetDays ?? 7} />
      </FormField>
      <div className="flex items-end xl:col-span-2"><p className="text-xs leading-5 text-slate-500">Task dibuat pukul 08.00 WIB. Tenggat harus sesudah tanggal mulai.</p></div>
      <div className="sm:col-span-2 xl:col-span-4">
        <button className={buttonClass} disabled={pending}>{pending ? 'Menyimpan…' : template ? 'Simpan template' : 'Buat template'}</button>
        <Feedback state={state} />
      </div>
    </form>
  )
}

function TemplateStatus({ template }: { template: TaskTemplate }) {
  const [state, action, pending] = useActionState(toggleTaskTemplate, initialState)
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={template.id} />
      <input type="hidden" name="is_active" value={String(!template.isActive)} />
      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${template.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
        {template.isActive ? 'Jadwal aktif' : 'Jadwal nonaktif'}
      </span>
      {template.isActive && <span className="text-xs text-slate-500">Berikutnya {new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(template.nextRunAt))} WIB</span>}
      <button className={secondaryClass} disabled={pending}>{template.isActive ? 'Jeda jadwal' : 'Aktifkan jadwal'}</button>
      <Feedback state={state} />
    </form>
  )
}

function TemplateDelete({ template }: { template: TaskTemplate }) {
  const [state, action, pending] = useActionState(deleteTaskTemplate, initialState)
  return <form action={action} className="mt-2 flex items-center gap-3">
    <input type="hidden" name="id" value={template.id} />
    <button className="text-xs font-semibold text-red-700 hover:underline" disabled={pending}>Hapus template</button>
    <Feedback state={state} />
  </form>
}

export default function TaskTemplateManager({
  sections,
  people,
  categories,
  templates,
  canAssignGlobalOwner,
  canManageCategories,
  ownerSelectionUserId,
  mode = 'categories',
}: {
  sections: MasterSection[]
  people: MasterPerson[]
  categories: TaskCategory[]
  templates: TaskTemplate[]
  canAssignGlobalOwner: boolean
  canManageCategories: boolean
  ownerSelectionUserId: string | null
  mode?: 'categories' | 'recurring'
}) {
  const categoryById = new Map(categories.map((category) => [category.id, category]))
  const sectionById = new Map(sections.map((section) => [section.id, section]))

  return (
    <div className="w-full space-y-6 px-4 pt-5 pb-6 sm:px-6 lg:px-8">
      <header className="pt-1">
        <h1 className="text-xl font-bold text-slate-900">{mode==='categories'?'Kategori Tugas':'Tugas Berulang'}</h1>
        {mode!=='categories'&&<p className="mt-1 text-sm text-slate-600">Atur tugas yang otomatis dibuat setiap minggu atau bulan sesuai jadwal penugasan.</p>}
      </header>
      {mode==='categories'&&canManageCategories&&<section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Tambah kategori</h2>
        <CategoryForm sections={sections} />
      </section>}
      {sections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Tidak ada section dalam cakupan Anda.</div>
      ) : sections.map((section) => {
        const sectionCategories = categories.filter((category) => category.orgUnitId === section.id)
        return (
          <section key={section.id} className="space-y-4" aria-labelledby={`section-${section.id}`}>
            <div className="flex items-end justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-wider text-red-700">{section.unitName}</p><h2 id={`section-${section.id}`} className="mt-1 text-lg font-bold text-slate-900">{section.name}</h2></div><span className="text-xs text-slate-500">{sectionCategories.length} kategori</span></div>
            {sectionCategories.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Belum ada kategori untuk section ini.</div> : sectionCategories.map((category) => {
              const categoryTemplates = templates.filter((template) => template.categoryId === category.id)
              return (
                <article key={category.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  {mode==='categories'&&<div className="border-b border-slate-100 p-5 sm:p-6"><div className={`${canManageCategories ? 'mb-4' : ''} flex flex-wrap items-center justify-between gap-2`}><div><h3 className="text-sm font-bold text-slate-900">{category.name}</h3><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${category.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{category.isActive ? 'Aktif' : 'Nonaktif'}</span></div>{canManageCategories&&<span className="text-xs text-slate-500">{categoryTemplates.length} template</span>}</div>{canManageCategories&&<><CategoryForm category={category} sections={sections} /><CategoryDelete category={category} /></>}</div>}
                  {mode==='recurring'&&<div className="space-y-4 p-5 sm:p-6">
                    {category.isActive && <details className="group rounded-xl border border-dashed border-slate-300">
                      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-red-700 marker:hidden">＋ Tambah tugas berulang</summary>
                      <div className="px-4 pb-4"><TemplateForm section={section} category={category} people={people} canAssignGlobalOwner={canAssignGlobalOwner} ownerSelectionUserId={ownerSelectionUserId} /></div>
                    </details>}
                    {categoryTemplates.map((template) => (
                      <div key={template.id} className="space-y-3 rounded-xl border border-slate-200 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="text-sm font-semibold text-slate-900">{template.name}</h4><p className="mt-1 text-xs text-slate-500">{template.recurrence === 'weekly' ? 'Mingguan' : 'Bulanan'} · setiap {template.recurrence === 'weekly' ? ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'][template.recurrenceDay - 1] : `tanggal ${template.recurrenceDay}`} · PIC {people.find((person) => person.id === template.ownerId)?.name ?? 'Tidak diketahui'}</p></div><TemplateStatus template={template} /></div>
                        {sectionById.get(template.orgUnitId) && categoryById.get(template.categoryId) && <TemplateForm section={section} category={category} people={people} canAssignGlobalOwner={canAssignGlobalOwner} ownerSelectionUserId={ownerSelectionUserId} template={template} />}
                        <TemplateDelete template={template} />
                      </div>
                    ))}
                  </div>}
                </article>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
