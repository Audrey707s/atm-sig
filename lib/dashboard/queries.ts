// FR-070 — Dashboard queries: ringkasan metrics dan task perlu perhatian
// NFR-001: hanya dipanggil dari server (Server Component / Server Action)

import { createClient } from '@/lib/supabase/server'
import type { SessionUser } from '@/lib/auth/session'
import type { TaskStatus } from '@/lib/constants/rbac'
import { getVisibleTaskOrgUnitIds } from '@/lib/tasks/scope'
import { isTaskOverdue } from '@/lib/tasks/deadline'

export type DashboardMetrics = {
  totalTask: number
  completed: number
  pending: number
  tertinggal: number   // jumlah task aktif yang melewati tenggat, termasuk Blocked
  blocked: number
  menuungguReview: number
  pengajuanDeadline: number
}

async function getDashboardScopeFilter(user: SessionUser): Promise<string | null> {
  // PIC hanya melihat task pribadinya. Role lain melihat seluruh task dalam
  // scope hierarki organisasi tanpa batas jumlah PIC/task.
  if (user.roleLevel === 2) return `owner_id.eq.${user.id}`

  const supabase = await createClient()
  const { data: orgUnits, error } = await supabase
    .from('org_units')
    .select('id, parent_id')

  if (error) throw new Error('Gagal memeriksa cakupan dashboard.')
  const assignedUnitExists = orgUnits?.some(({ id }) => id === user.orgUnitId)
  if (!assignedUnitExists) {
    throw new Error('Penempatan organisasi Anda belum dapat diverifikasi.')
  }

  const visibleOrgUnitIds = getVisibleTaskOrgUnitIds(user, orgUnits ?? [])
  return visibleOrgUnitIds.length > 0
    ? `org_unit_id.in.(${visibleOrgUnitIds.join(',')})`
    : 'org_unit_id.eq.-1'
}

export type TaskPerhatian = {
  id: string
  title: string
  ownerName: string
  dueDate: string
  timePct: number
  isOverdue: boolean
  progressPct: number
  status: TaskStatus
}

export type DashboardPerformanceSource = {
  ownerId: string
  ownerName: string
  orgUnitId: number
  orgUnitName: string
  progressPct: number
  status: TaskStatus
  dueDate: string
}

export type DashboardPerformance = {
  owners: {
    id: string
    name: string
    activeTasks: number
    overdueTasks: number
    averageProgress: number
  }[]
  orgUnits: {
    id: number
    name: string
    activeTasks: number
    overdueTasks: number
    averageProgress: number
  }[]
}

/**
 * Menghitung persentase waktu berjalan (0–100+, bisa > 100 jika overdue)
 * OQ-03, implementasi aturan #1: (sekarang - start) / (due - start) * 100
 */
export function calcTimePct(
  startDate: string,
  dueDate: string,
  now = Date.now(),
): number {
  const start = new Date(startDate).getTime()
  const due = new Date(dueDate).getTime()
  if (due <= start) return 0
  return ((now - start) / (due - start)) * 100
}

export function buildDashboardPerformance(
  tasks: readonly DashboardPerformanceSource[],
  now = new Date(),
): DashboardPerformance {
  const ownerStats = new Map<string, {
    id: string
    name: string
    activeTasks: number
    overdueTasks: number
    progressTotal: number
  }>()
  const orgUnitStats = new Map<number, {
    id: number
    name: string
    activeTasks: number
    overdueTasks: number
    progressTotal: number
  }>()

  for (const task of tasks) {
    if (task.status === 'Done') continue

    const overdue = isTaskOverdue(task.dueDate, task.status, now)
    const owner = ownerStats.get(task.ownerId) ?? {
      id: task.ownerId,
      name: task.ownerName,
      activeTasks: 0,
      overdueTasks: 0,
      progressTotal: 0,
    }
    owner.activeTasks += 1
    owner.progressTotal += task.progressPct
    if (overdue) owner.overdueTasks += 1
    ownerStats.set(task.ownerId, owner)

    const orgUnit = orgUnitStats.get(task.orgUnitId) ?? {
      id: task.orgUnitId,
      name: task.orgUnitName,
      activeTasks: 0,
      overdueTasks: 0,
      progressTotal: 0,
    }
    orgUnit.activeTasks += 1
    orgUnit.progressTotal += task.progressPct
    if (overdue) orgUnit.overdueTasks += 1
    orgUnitStats.set(task.orgUnitId, orgUnit)
  }

  const summarize = <T extends {
    activeTasks: number
    progressTotal: number
  }>(stats: T) => {
    const { progressTotal, ...summary } = stats
    return {
      ...summary,
      averageProgress: Math.round(progressTotal / stats.activeTasks),
    }
  }

  return {
    owners: [...ownerStats.values()]
      .map(summarize)
      .sort((a, b) => b.activeTasks - a.activeTasks || a.name.localeCompare(b.name, 'id')),
    orgUnits: [...orgUnitStats.values()]
      .map(summarize)
      .sort((a, b) => a.name.localeCompare(b.name, 'id')),
  }
}

async function getDashboardPerformanceSources(
  user: SessionUser,
  from?: string,
  toExclusive?: string,
  card = 'total',
): Promise<DashboardPerformanceSource[]> {
  const supabase = await createClient()
  const scopeFilter = await getDashboardScopeFilter(user)
  const pageSize = 500
  const tasks: DashboardPerformanceSource[] = []

  for (let offset = 0; ; offset += pageSize) {
    let query = supabase
      .from('tasks')
      .select(`
        owner_id,
        org_unit_id,
        progress_pct,
        status,
        due_date,
        users!tasks_owner_id_fkey ( name ),
        org_units!tasks_org_unit_id_fkey ( name )
      `)
      .order('due_date', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (from) query = query.gte('due_date',from)
    if (toExclusive) query = query.lt('due_date',toExclusive)
    if (scopeFilter) query = query.or(scopeFilter)

    const { data, error } = await query
    if (error) throw new Error('Gagal memuat ringkasan progress dashboard.')
    if (!data) throw new Error('Data progress dashboard tidak tersedia.')

    for (const row of data) {
      if (!matchesDashboardCard({status:row.status,dueDate:row.due_date},card)) continue
      const owner = row.users as { name: string } | null
      const orgUnit = row.org_units as { name: string } | null
      if (!owner || !orgUnit) {
        throw new Error('Informasi PIC atau section task tidak tersedia.')
      }
      tasks.push({
        ownerId: row.owner_id,
        ownerName: owner.name,
        orgUnitId: row.org_unit_id,
        orgUnitName: orgUnit.name,
        progressPct: row.progress_pct,
        status: row.status,
        dueDate: row.due_date,
      })
    }

    if (data.length < pageSize) return tasks
  }
}

export async function getDashboardPerformance(
  user: SessionUser,
  now = new Date(),
  from?: string,
  toExclusive?: string,
  card = 'total',
): Promise<DashboardPerformance> {
  const tasks = await getDashboardPerformanceSources(user,from,toExclusive,card)
  return buildDashboardPerformance(tasks, now)
}

/**
 * Mengambil metrics ringkasan dashboard sesuai role user.
 */
export async function getDashboardMetrics(user: SessionUser, from?: string, toExclusive?: string): Promise<DashboardMetrics> {
  const supabase = await createClient()
  const scopeFilter = await getDashboardScopeFilter(user)

  // Explicit pagination: Supabase default maximum rows otherwise truncates metrics.
  const tasks: Array<{ id:string; status:TaskStatus; progress_pct:number; start_date:string; due_date:string }> = []
  const pageSize = 500
  for (let offset = 0;offset < 100000;offset += pageSize) {
    let query = supabase.from('tasks')
      .select('id,status,progress_pct,start_date,due_date')
      .order('id',{ascending:true})
      .range(offset,offset+pageSize-1)
    if (from) query = query.gte('due_date',from)
    if (toExclusive) query = query.lt('due_date',toExclusive)
    if (scopeFilter) query = query.or(scopeFilter)
    const { data,error } = await query
    if (error || !data) throw new Error('Gagal memuat ringkasan task dashboard.')
    tasks.push(...data)
    if (data.length < pageSize) break
    if (offset+pageSize >= 100000) throw new Error('Data task melebihi batas aman ringkasan dashboard.')
  }
  let deadlineQuery = supabase.from('deadline_change_requests')
    .select('id',{count:'exact',head:true}).eq('status','Menunggu approval')
  if (user.roleLevel === 2) deadlineQuery = deadlineQuery.eq('requested_by', user.id)
  const {count:pendingDeadlines,error:deadlineError} = await deadlineQuery

  // Card Melewati Tenggat: semua status aktif, termasuk Blocked.
  // Jangan hitung task Done maupun task yang baru mendekati deadline.
  const tertinggal = tasks.filter((task) => isTaskOverdue(task.due_date, task.status)).length

  const blocked = tasks.filter((t) => t.status === 'Blocked').length
  const menuungguReview = tasks.filter((t) => t.status === 'Review').length

  if (deadlineError) throw new Error('Gagal memuat jumlah pengajuan deadline.')

  return {
    totalTask: tasks.length,
    completed: tasks.filter((task) => task.status === 'Done').length,
    pending: tasks.filter((task) => task.status === 'To do').length,
    tertinggal,
    blocked,
    menuungguReview,
    pengajuanDeadline: pendingDeadlines ?? 0,
  }
}

/**
 * Mengambil task yang perlu perhatian:
 * - Overdue (deadline sudah lewat dan belum Done)
 * - Waktu > 80% (mendekati deadline)
 * - Status Blocked atau Review lebih dari 3 hari
 * Sesuai Stitch mockup 04_dashboard tabel "Task Perlu Perhatian"
 */
export function matchesDashboardCard(task:{status:TaskStatus;dueDate:string},card:string):boolean {
  switch(card){
    case 'todo': return task.status==='To do'
    case 'blocked': return task.status==='Blocked'
    case 'review': return task.status==='Review'
    case 'done': return task.status==='Done'
    case 'overdue': return isTaskOverdue(task.dueDate,task.status)
    case 'deadline': return false // Deadline requests are not task statuses.
    default: return true
  }
}

export async function getTasksPerluPerhatian(
  user: SessionUser,
  limit = 10,
  from?: string,
  toExclusive?: string,
  card = 'total',
): Promise<TaskPerhatian[]> {
  const supabase = await createClient()
  const scopeFilter = await getDashboardScopeFilter(user)

  // Scan relevant candidates BEFORE applying the display limit. A hard
  // limit(50) here hid Blocked/Review tasks with later due dates.
  const tasks: Array<{
    id:string; title:string; status:TaskStatus; progress_pct:number;
    start_date:string; due_date:string; users:{name:string}|null
  }> = []
  const pageSize = 500
  for (let offset=0;offset<100000;offset+=pageSize) {
    let query = supabase.from('tasks')
      .select('id,title,status,progress_pct,start_date,due_date,users!tasks_owner_id_fkey(name)')
      .order('due_date',{ascending:true})
      .range(offset,offset+pageSize-1)
    if (from) query = query.gte('due_date',from)
    if (toExclusive) query = query.lt('due_date',toExclusive)
    if (scopeFilter) query = query.or(scopeFilter)
    const {data,error} = await query
    if (error || !data) throw new Error('Gagal memuat task yang perlu perhatian.')
    tasks.push(...data)
    if (data.length < pageSize) break
    if (offset+pageSize>=100000) throw new Error('Data task perhatian melebihi batas aman.')
  }

  const now = new Date()

  const result: TaskPerhatian[] = tasks
    .map((t) => {
      const timePct = calcTimePct(t.start_date, t.due_date)
      const isOverdue = isTaskOverdue(t.due_date, t.status, now)
      const ownerUser = t.users as { name: string } | null
      return {
        id: t.id,
        title: t.title,
        ownerName: ownerUser?.name ?? '—',
        dueDate: t.due_date,
        timePct,
        isOverdue,
        progressPct: t.progress_pct,
        status: t.status as TaskStatus,
      }
    })
    // Filter: hanya yang memerlukan perhatian
    .filter((t) => card==='total' ? (t.isOverdue || t.timePct >= 80 || t.status === 'Blocked' || t.status === 'Review') : matchesDashboardCard({status:t.status,dueDate:t.dueDate},card))
    .slice(0, limit)

  return result
}
