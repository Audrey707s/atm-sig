// FR-029, FR-030 — Task queries: daftar task dengan filter, search, paginasi
// NFR-001: semua query dari server; RBAC ditangani di sisi server

import { createClient } from '@/lib/supabase/server'
import type { SessionUser } from '@/lib/auth/session'
import { TASK_STATUSES, type TaskStatus } from '@/lib/constants/rbac'
import { calcTimePct } from '@/lib/dashboard/queries'
import { isTaskOverdue } from './deadline'
import { getTaskScopeFilter, getVisibleTaskOrgUnitIds } from './scope'
import { isValidUuid } from './validation'

export type TaskListItem = {
  id: string
  title: string
  status: TaskStatus
  priority: 'rendah' | 'sedang' | 'tinggi'
  progressPct: number
  startDate: string
  dueDate: string
  completedAt: string | null
  timePct: number
  isOverdue: boolean
  ownerName: string
  ownerId: string
  reviewerId: string | null
  assignerName: string
  reviewerName: string | null
  orgUnitName: string
  createdAt: string
}

export type TaskFilters = {
  status?: TaskStatus | null
  priority?: 'rendah' | 'sedang' | 'tinggi' | null
  search?: string | null
  ownerId?: string | null
  orgUnitId?: number | null
  dateFrom?: string | null
  dateTo?: string | null
  createdFrom?: string | null
  createdTo?: string | null
  page?: number
  pageSize?: number
}

export type TaskFilterOptions = {
  sections: { id: number; name: string }[]
  owners: { id: string; name: string }[]
}

export type TaskCreationOptions = {
  categories: { id: string; name: string; orgUnitId: number }[]
  sections: { id: number; name: string; parentId: number | null }[]
  owners: {
    id: string
    name: string
    orgUnitId: number
    roleLevel: number
    reviewerId: string | null
    reviewerName: string | null
  }[]
}

export async function getTaskCreationOptions(user: SessionUser): Promise<TaskCreationOptions> {
  if (user.roleLevel < 2) {
    throw new Error('Role Anda tidak dapat membuat task.')
  }

  const supabase = await createClient()
  const [{ data: orgUnits, error: unitsError }, { data: profiles, error: profilesError }] =
    await Promise.all([
      supabase.from('org_units').select('id, name, parent_id, type').order('name'),
      supabase.from('users')
        .select('id, name, role_id, org_unit_id, supervisor_id')
        .eq('status', 'aktif')
        .order('name'),
    ])
  if (unitsError || profilesError) {
    throw new Error('Gagal memuat pilihan pembuatan task.')
  }

  const roleIds = [...new Set((profiles ?? []).map(({ role_id }) => role_id))]
  const { data: roles, error: rolesError } = roleIds.length
    ? await supabase.from('roles').select('id, level').in('id', roleIds)
    : { data: [], error: null }
  if (rolesError) throw new Error('Gagal memuat role PIC task.')

  const roleLevels = new Map((roles ?? []).map(({ id, level }) => [id, level]))
  const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile]))
  const units = orgUnits ?? []
  const visibleUnitIds = getVisibleTaskOrgUnitIds(user, units)
  const sections = units
    .filter((unit) => unit.type === 'section' && visibleUnitIds.includes(unit.id) && (user.roleLevel !== 2 || unit.id === user.orgUnitId))
    .map((section) => ({ id: section.id, name: section.name, parentId: section.parent_id }))
  const owners = (profiles ?? []).flatMap<TaskCreationOptions['owners'][number]>((profile) => {
    if (user.roleLevel === 2 && profile.id !== user.id) return []
    const roleLevel = roleLevels.get(profile.role_id)
    if (roleLevel === undefined || roleLevel < 2 || roleLevel > 6) return []

    if (roleLevel >= 5) {
      return [{
        id: profile.id,
        name: profile.name,
        orgUnitId: profile.org_unit_id,
        roleLevel,
        reviewerId: null,
        reviewerName: null,
      }]
    }

    const reviewer = profile.supervisor_id ? profilesById.get(profile.supervisor_id) : null
    const reviewerRoleLevel = reviewer ? roleLevels.get(reviewer.role_id) : undefined
    if (!reviewer || reviewerRoleLevel !== roleLevel + 1) return []
    return [{
      id: profile.id,
      name: profile.name,
      orgUnitId: profile.org_unit_id,
      roleLevel,
      reviewerId: reviewer.id,
      reviewerName: reviewer.name,
    }]
  })

  const { data: categories, error: categoriesError } = await supabase.from('task_categories')
    .select('id,name,org_unit_id').eq('is_active',true).order('name')
  if (categoriesError) throw new Error('Gagal memuat kategori task.')
  const allowedCategoryUnitIds = new Set(sections.flatMap(section => [
    section.id,
    ...(section.parentId !== null ? [section.parentId] : []),
  ]))
  return { sections, owners, categories: (categories ?? [])
    .filter(category => allowedCategoryUnitIds.has(category.org_unit_id))
    .map(category => ({id:category.id,name:category.name,orgUnitId:category.org_unit_id})) }
}

export async function getTaskFilterOptions(user: SessionUser): Promise<TaskFilterOptions> {
  const supabase = await createClient()
  const { data: orgUnits, error: orgUnitsError } = await supabase
    .from('org_units').select('id, parent_id, type')
  if (orgUnitsError) throw new Error('Gagal memeriksa cakupan filter task.')

  const visibleUnitIds = getVisibleTaskOrgUnitIds(user, orgUnits ?? [])
  const visibleSectionIds = (orgUnits ?? [])
    .filter(({ id, type }) => type === 'section' && visibleUnitIds.includes(id))
    .map(({ id }) => id)

  const sectionsPromise = visibleSectionIds.length === 0
    ? Promise.resolve({ data: [], error: null })
    : supabase.from('org_units').select('id, name').in('id', visibleSectionIds).order('name')
  const ownersPromise = user.roleLevel < 5 && visibleUnitIds.length === 0
    ? Promise.resolve({ data: [], error: null })
    : (user.roleLevel < 5
      ? supabase.from('users').select('id, name').eq('status', 'aktif').in('org_unit_id', visibleUnitIds).order('name')
      : supabase.from('users').select('id, name').eq('status', 'aktif').order('name'))

  const [sectionsResult, ownersResult] = await Promise.all([sectionsPromise, ownersPromise])
  const { data: sections, error: sectionsError } = sectionsResult
  const { data: owners, error: ownersError } = ownersResult

  if (sectionsError || ownersError) {
    throw new Error('Gagal memuat pilihan filter task.')
  }

  return {
    sections: (sections ?? []).map(({ id, name }) => ({ id, name })),
    owners: (owners ?? []).map(({ id, name }) => ({ id, name })),
  }
}

export type TaskSupportRecipient = {
  id: string
  name: string
}

export async function getTaskSupportRecipients(
  currentUserId: string,
): Promise<TaskSupportRecipient[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('users')
    .select('id, name')
    .eq('status', 'aktif')
    .neq('id', currentUserId)
    .order('name')

  if (error) throw new Error('Gagal memuat pilihan penerima support.')
  return data ?? []
}

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

function parseDateOnly(value: string | null | undefined): string | null {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Filter periode task tidak valid.')
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('Filter periode task tidak valid.')
  }
  return value
}

function validateTaskFilters(filters: TaskFilters): TaskFilters {
  if (filters.status && !TASK_STATUSES.includes(filters.status)) {
    throw new Error('Filter status task tidak valid.')
  }
  if (
    filters.priority &&
    !['rendah', 'sedang', 'tinggi'].includes(filters.priority)
  ) {
    throw new Error('Filter prioritas task tidak valid.')
  }
  if (filters.ownerId && !isValidUuid(filters.ownerId)) {
    throw new Error('Filter PIC task tidak valid.')
  }
  if (
    filters.orgUnitId !== undefined &&
    filters.orgUnitId !== null &&
    (!Number.isInteger(filters.orgUnitId) || filters.orgUnitId <= 0)
  ) {
    throw new Error('Filter section task tidak valid.')
  }
  if (filters.search && (typeof filters.search !== 'string' || filters.search.length > 100)) {
    throw new Error('Kata pencarian maksimal 100 karakter.')
  }

  const dateFrom = parseDateOnly(filters.dateFrom)
  const dateTo = parseDateOnly(filters.dateTo)
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new Error('Tanggal awal periode harus sebelum atau sama dengan tanggal akhir.')
  }
  const createdFrom = parseDateOnly(filters.createdFrom)
  const createdTo = parseDateOnly(filters.createdTo)
  if (createdFrom && createdTo && createdFrom > createdTo) throw new Error('Periode pembuatan tugas tidak valid.')
  return { ...filters, dateFrom, dateTo, createdFrom, createdTo, search: filters.search?.trim() || null }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseEvidenceFile(value: unknown): EvidenceReq['evidenceFiles'][number] {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.file_or_link !== 'string' ||
    typeof value.uploaded_at !== 'string'
  ) {
    throw new Error('Data file evidence task tidak valid.')
  }

  let uploaderName = '—'
  if (value.uploader !== null) {
    if (!isRecord(value.uploader) || typeof value.uploader.name !== 'string') {
      throw new Error('Data pengunggah evidence task tidak valid.')
    }
    uploaderName = value.uploader.name
  }

  return {
    id: value.id,
    externalUrl: value.file_or_link.startsWith('https://') ? value.file_or_link : null,
    uploadedAt: value.uploaded_at,
    uploaderName,
  }
}

/**
 * FR-029 — Ambil daftar task sesuai filter dan akses role user.
 * Filter cakupan server menyamai RLS: unit sendiri, section di bawah unit untuk SM,
 * dan task milik atau yang direview user.
 */
export async function getTaskList(
  user: SessionUser,
  filters: TaskFilters = {},
): Promise<{ items: TaskListItem[]; total: number }> {
  filters = validateTaskFilters(filters)
  const supabase = await createClient()
  const scopeFilter = await getTaskScopeFilter(supabase, user)
  const requestedPage = filters.page ?? 1
  const requestedPageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const pageSize = Number.isInteger(requestedPageSize) &&
    requestedPageSize > 0 &&
    requestedPageSize <= MAX_PAGE_SIZE
    ? requestedPageSize
    : DEFAULT_PAGE_SIZE
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('tasks')
    .select(
      `
      id, title, status, priority, progress_pct,
      start_date, due_date, completed_at, created_at,
      owner_id, reviewer_id,
      owner:users!tasks_owner_id_fkey ( name ),
      assigner:users!tasks_assigner_id_fkey ( name ),
      reviewer:users!tasks_reviewer_id_fkey ( name ),
      org_unit:org_units!tasks_org_unit_id_fkey ( name )
    `,
      { count: 'exact' },
    )
    .order('due_date', { ascending: true })
    .range(from, to)

  if (scopeFilter) query = query.or(scopeFilter)

  // Filter status
  if (filters.status) {
    query = query.eq('status', filters.status)
  }

  // Filter prioritas
  if (filters.priority) {
    query = query.eq('priority', filters.priority)
  }

  // Filter owner
  if (filters.ownerId) {
    query = query.eq('owner_id', filters.ownerId)
  }

  // Filter org unit
  if (filters.orgUnitId) {
    query = query.eq('org_unit_id', filters.orgUnitId)
  }

  if (filters.createdFrom) query = query.gte('created_at', `${filters.createdFrom}T00:00:00.000+07:00`)
  if (filters.createdTo) query = query.lte('created_at', `${filters.createdTo}T23:59:59.999+07:00`)
  if (filters.dateFrom) {
    query = query.gte('due_date', `${filters.dateFrom}T00:00:00.000+07:00`)
  }
  if (filters.dateTo) {
    query = query.lte('start_date', `${filters.dateTo}T23:59:59.999+07:00`)
  }

  // Search title
  if (filters.search) {
    query = query.ilike('title', `%${filters.search}%`)
  }

  const { data, error, count } = await query

  if (error) throw new Error('Gagal memuat daftar task.')
  if (!data) throw new Error('Data daftar task tidak tersedia.')

  const now = new Date()
  const items: TaskListItem[] = data.map((t) => {
    const ownerRel = t.owner as { name: string } | null
    const assignerRel = t.assigner as { name: string } | null
    const reviewerRel = t.reviewer as { name: string } | null
    const orgUnitRel = t.org_unit as { name: string } | null
    const timePct = calcTimePct(t.start_date, t.due_date)
    const isOverdue = isTaskOverdue(t.due_date, t.status, now)

    return {
      id: t.id,
      title: t.title,
      status: t.status as TaskStatus,
      priority: t.priority as 'rendah' | 'sedang' | 'tinggi',
      progressPct: t.progress_pct,
      startDate: t.start_date,
      dueDate: t.due_date,
      completedAt: t.completed_at,
      timePct,
      isOverdue,
      ownerName: ownerRel?.name ?? '—',
      ownerId: t.owner_id,
      reviewerId: t.reviewer_id,
      assignerName: assignerRel?.name ?? '—',
      reviewerName: reviewerRel?.name ?? null,
      orgUnitName: orgUnitRel?.name ?? '—',
      createdAt: t.created_at,
    }
  })

  return { items, total: count ?? 0 }
}

/** Load all pages for compact views such as Kanban and Gantt while retaining the same server-side scope. */
export async function getAllTaskList(
  user: SessionUser,
  filters: Omit<TaskFilters, 'page' | 'pageSize'> = {},
): Promise<{ items: TaskListItem[]; total: number }> {
  const firstPage = await getTaskList(user, { ...filters, page: 1, pageSize: MAX_PAGE_SIZE })
  const pages = Math.ceil(firstPage.total / MAX_PAGE_SIZE)
  const remaining = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, index) =>
    getTaskList(user, { ...filters, page: index + 2, pageSize: MAX_PAGE_SIZE }),
  ))
  return { items: [...firstPage.items, ...remaining.flatMap(({ items }) => items)], total: firstPage.total }
}

/**
 * FR-029 — Ambil satu task dengan detail lengkap (untuk Task Detail page).
 */
export type TaskDetail = TaskListItem & {
  orgUnitId: number
  parentTaskId: string | null
  reviewerId: string | null
  wbsItems: WbsItem[]
  progressHistory: ProgressHistory[]
  evidenceRequirements: EvidenceReq[]
  comments: TaskComment[]
  supports: TaskSupport[]
  deadlineRequests: DeadlineRequest[]
}

export type ProgressHistory = {
  id: string
  progressPct: number
  changedAt: string
  changedByName: string
}

export type WbsItem = {
  id: string
  parentId: string | null
  title: string
  weight: number
  isDone: boolean
}

export type EvidenceReq = {
  id: string
  description: string
  mandatory: boolean
  evidenceFiles: {
    id: string
    externalUrl: string | null
    uploadedAt: string
    uploaderName: string
  }[]
}

export type TaskComment = {
  id: string
  body: string
  createdAt: string
  userName: string
  userId: string
}

export type TaskSupport = {
  id: string
  neededFromId: string
  neededFromName: string
  description: string
  status: 'diminta' | 'diberikan'
}

export type DeadlineRequest = {
  id: string
  oldDueDate: string
  newDueDate: string
  reason: string
  status: 'Menunggu approval' | 'Disetujui' | 'Ditolak'
  requestedByName: string
  approverName: string | null
  decidedAt: string | null
  createdAt: string
}

export type PendingDeadlineRequest = {
  id: string
  taskId: string
  taskTitle: string
  requesterName: string
  orgUnitName: string
  oldDueDate: string
  newDueDate: string
  reason: string
  createdAt: string
  status: DeadlineRequest['status']
}

export async function getPendingDeadlineRequests(
  user: SessionUser,
): Promise<PendingDeadlineRequest[]> {
  if (user.roleLevel < 4) {
    throw new Error('Hanya SM, GM, atau Super Admin yang dapat melihat approval deadline.')
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('deadline_change_requests')
    .select(`
      id, task_id, old_due_date, new_due_date, reason, created_at, status,
      requester:users!deadline_change_requests_requested_by_fkey ( name ),
      task:tasks!deadline_change_requests_task_id_fkey (
        title,
        owner:users!tasks_owner_id_fkey ( name ),
        org_unit:org_units!tasks_org_unit_id_fkey ( name )
      )
    `)
    .order('created_at', { ascending: true })

  if (error) throw new Error('Gagal memuat pengajuan perubahan deadline.')

  return (data ?? []).map((request) => {
    if (!isRecord(request.task) || !isRecord(request.requester)) {
      throw new Error('Data pengajuan perubahan deadline tidak lengkap.')
    }
    if (
      typeof request.task.title !== 'string' ||
      !isRecord(request.task.owner) ||
      typeof request.task.owner.name !== 'string' ||
      !isRecord(request.task.org_unit) ||
      typeof request.task.org_unit.name !== 'string' ||
      typeof request.requester.name !== 'string'
    ) {
      throw new Error('Informasi task atau PIC pada pengajuan deadline tidak valid.')
    }

    return {
      id: request.id,
      taskId: request.task_id,
      taskTitle: request.task.title,
      requesterName: request.requester.name,
      orgUnitName: request.task.org_unit.name,
      oldDueDate: request.old_due_date,
      newDueDate: request.new_due_date,
      reason: request.reason,
      createdAt: request.created_at,
      status: request.status,
    }
  })
}

export async function getTaskDetail(
  taskId: string,
  user: SessionUser,
): Promise<TaskDetail | null> {
  const supabase = await createClient()
  const scopeFilter = await getTaskScopeFilter(supabase, user)

  let taskQuery = supabase
    .from('tasks')
    .select(
      `
      id, title, status, priority, progress_pct,
      start_date, due_date, completed_at, created_at,
      parent_task_id, owner_id, reviewer_id, org_unit_id,
      owner:users!tasks_owner_id_fkey ( name ),
      assigner:users!tasks_assigner_id_fkey ( name ),
      reviewer:users!tasks_reviewer_id_fkey ( name ),
      org_unit:org_units!tasks_org_unit_id_fkey ( name )
    `,
    )
  if (scopeFilter) taskQuery = taskQuery.or(scopeFilter)
  const { data: t, error } = await taskQuery.eq('id', taskId).single()

  if (error?.code === 'PGRST116' || (!error && !t)) return null
  if (error) throw new Error('Gagal memuat detail task.')
  if (!t) return null

  const now = new Date()
  const ownerRel = t.owner as { name: string } | null
  const assignerRel = t.assigner as { name: string } | null
  const reviewerRel = t.reviewer as { name: string } | null
  const orgUnitRel = t.org_unit as { name: string } | null
  const timePct = calcTimePct(t.start_date, t.due_date)
  const isOverdue = isTaskOverdue(t.due_date, t.status, now)

  // Query turunan hanya bergantung pada taskId, jadi dijalankan paralel (setelah
  // task utama lolos pemeriksaan cakupan di atas). Pemeriksaan error tetap
  // berurutan seperti sebelumnya agar pesan error tidak berubah.
  const [
    wbsResult,
    progressResult,
    evidenceResult,
    commentsResult,
    supportsResult,
    deadlineResult,
  ] = await Promise.all([
    supabase
      .from('wbs_items')
      .select('id, parent_id, title, weight, is_done')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true }),
    supabase
      .from('task_progress_history')
      .select('id, progress_pct, created_at, user:users!task_progress_history_changed_by_fkey ( name )')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false }),
    supabase
      .from('evidence_requirements')
      .select(`
      id, description, mandatory,
      task_evidence ( id, file_or_link, uploaded_at, uploader:users!task_evidence_uploader_id_fkey ( name ) )
    `)
      .eq('task_id', taskId),
    supabase
      .from('task_comments')
      .select('id, body, created_at, user:users!task_comments_user_id_fkey ( id, name )')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true }),
    supabase
      .from('task_supports')
      .select('id, needed_from_id, description, status, needed_from:users!task_supports_needed_from_id_fkey ( name )')
      .eq('task_id', taskId),
    supabase
      .from('deadline_change_requests')
      .select(
        `id, old_due_date, new_due_date, reason, status, decided_at, created_at,
       requester:users!deadline_change_requests_requested_by_fkey ( name ),
       approver:users!deadline_change_requests_approver_id_fkey ( name )`
      )
      .eq('task_id', taskId)
      .order('created_at', { ascending: false }),
  ])

  // WBS items
  const { data: wbsData, error: wbsError } = wbsResult
  if (wbsError) throw new Error('Gagal memuat daftar WBS task.')

  const wbsItems: WbsItem[] = (wbsData ?? []).map((w) => ({
    id: w.id,
    parentId: w.parent_id,
    title: w.title,
    weight: w.weight,
    isDone: w.is_done,
  }))

  const { data: progressRows, error: progressError } = progressResult
  if (progressError) throw new Error('Gagal memuat riwayat progress task.')

  const progressHistory: ProgressHistory[] = (progressRows ?? []).map((row) => {
    const userRel = row.user as { name: string } | null
    return {
      id: row.id,
      progressPct: row.progress_pct,
      changedAt: row.created_at,
      changedByName: userRel?.name ?? '—',
    }
  })

  // Evidence requirements + files
  const { data: evReqs, error: evidenceError } = evidenceResult
  if (evidenceError) throw new Error('Gagal memuat persyaratan evidence task.')

  const evidenceRequirements: EvidenceReq[] = (evReqs ?? []).map((r) => {
    if (!Array.isArray(r.task_evidence)) {
      throw new Error('Daftar evidence task tidak valid.')
    }

    return {
      id: r.id,
      description: r.description,
      mandatory: r.mandatory,
      evidenceFiles: r.task_evidence.map(parseEvidenceFile),
    }
  })

  // Comments
  const { data: commentsData, error: commentsError } = commentsResult
  if (commentsError) throw new Error('Gagal memuat komentar task.')

  const comments: TaskComment[] = (commentsData ?? []).map((c) => {
    const userRel = c.user as { id: string; name: string } | null
    return {
      id: c.id,
      body: c.body,
      createdAt: c.created_at,
      userName: userRel?.name ?? '—',
      userId: userRel?.id ?? '',
    }
  })

  // Support requests
  const { data: supportsData, error: supportsError } = supportsResult
  if (supportsError) throw new Error('Gagal memuat permintaan support task.')

  const supports: TaskSupport[] = (supportsData ?? []).map((s) => {
    const fromRel = s.needed_from as { name: string } | null
    return {
      id: s.id,
      neededFromId: s.needed_from_id,
      neededFromName: fromRel?.name ?? '—',
      description: s.description,
      status: s.status as 'diminta' | 'diberikan',
    }
  })

  // Deadline requests
  const { data: dlRequests, error: deadlineError } = deadlineResult
  if (deadlineError) throw new Error('Gagal memuat riwayat perubahan deadline.')

  const deadlineRequests: DeadlineRequest[] = (dlRequests ?? []).map((d) => {
    const reqRel = d.requester as { name: string } | null
    const approverRel = d.approver as { name: string } | null
    return {
      id: d.id,
      oldDueDate: d.old_due_date,
      newDueDate: d.new_due_date,
      reason: d.reason,
      status: d.status as DeadlineRequest['status'],
      requestedByName: reqRel?.name ?? '—',
      approverName: approverRel?.name ?? null,
      decidedAt: d.decided_at,
      createdAt: d.created_at,
    }
  })

  return {
    id: t.id,
    title: t.title,
    status: t.status as TaskStatus,
    priority: t.priority as 'rendah' | 'sedang' | 'tinggi',
    progressPct: t.progress_pct,
    startDate: t.start_date,
    dueDate: t.due_date,
    completedAt: t.completed_at,
    timePct,
    isOverdue,
    ownerName: ownerRel?.name ?? '—',
    ownerId: t.owner_id,
    reviewerId: t.reviewer_id,
    assignerName: assignerRel?.name ?? '—',
    reviewerName: reviewerRel?.name ?? null,
    orgUnitName: orgUnitRel?.name ?? '—',
    createdAt: t.created_at,
    orgUnitId: t.org_unit_id,
    parentTaskId: t.parent_task_id,
    wbsItems,
    progressHistory,
    evidenceRequirements,
    comments,
    supports,
    deadlineRequests,
  }
}
