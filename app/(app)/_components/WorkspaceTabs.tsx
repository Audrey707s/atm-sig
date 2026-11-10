import Link from 'next/link'
import NavIcon, {type NavIconName} from './NavIcon'
type Tab = { label: string; href: string; minLevel?: number; icon?: NavIconName }
type Props = { current: string; tabs: Tab[]; roleLevel?: number; label?: string }
export default function WorkspaceTabs({ current, tabs, roleLevel = 6, label = 'Tab halaman' }: Props) {
  return (
    <nav aria-label={label} className="mb-6 flex max-w-full gap-1.5 overflow-x-auto pb-1">
      {tabs.filter(tab => roleLevel >= (tab.minLevel ?? 1)).map(tab => (
        <Link key={tab.href} href={tab.href} aria-current={current === tab.href ? 'page' : undefined}
          className="atm-tab">
          {tab.icon && <NavIcon name={tab.icon} className="h-4 w-4 shrink-0" />}
          <span>{tab.label}</span>
        </Link>
      ))}
    </nav>
  )
}
export const WORK_TABS: Tab[] = [
  { label: 'Tugas Saya', icon: 'user', href: '/tasks?mine=1' },
  { label: 'Tugas Tim', icon: 'tasks', href: '/tasks', minLevel: 3 },
  { label: 'Papan Tugas', icon: 'kanban', href: '/kanban', minLevel: 3 },
  { label: 'Linimasa', icon: 'timeline', href: '/timeline', minLevel: 3 },
]
export const DASHBOARD_TABS: Tab[] = [
  { label: 'Ringkasan', icon: 'dashboard', href: '/dashboard' },
  { label: 'Evaluasi Kinerja', icon: 'jobload', href: '/jobload', minLevel: 3 },
]
export const APPROVAL_TABS: Tab[] = [
  { label: 'Tinjauan Tugas', icon: 'approval', href: '/review-inbox', minLevel: 3 },
  { label: 'Persetujuan Tenggat', icon: 'calendar', href: '/approvals', minLevel: 4 },
]
export const MASTER_TABS: Tab[] = [
  { label: 'Profil', icon: 'user', href: '/account' },
  { label: 'Pengguna', icon: 'user', href: '/users', minLevel: 3 },
  { label: 'Organizations', icon: 'structure', href: '/organizations' },
  { label: 'Kategori Tasks', icon: 'master', href: '/task-templates', minLevel: 2 },
]
export const PIC_MASTER_TABS: Tab[] = [
  { label: 'Organizations', icon: 'structure', href: '/organizations' },
  { label: 'Profil', icon: 'user', href: '/account' },
  { label: 'Kategori Tasks', icon: 'master', href: '/task-templates' },
]
export const MASTER_USER_TABS: Tab[] = MASTER_TABS
export const REPORT_TABS: Tab[] = [
  { label: 'Laporan Task', icon: 'reports', href: '/reports' },
  { label: 'Catatan Audit', icon: 'audit', href: '/audit-log', minLevel: 3 },
]
