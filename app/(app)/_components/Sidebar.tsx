'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import type { SessionUser } from '@/lib/auth/session'
import NavIcon, { type NavIconName } from './NavIcon'

type NavItem = { label: string; href: string; minLevel: number; maxLevel?: number; routes: string[]; icon: NavIconName }
type NavGroup = { heading: string; items: NavItem[] }

const GROUPS: NavGroup[] = [
  { heading: 'UTAMA', items: [
    { label: 'Dashboard', href: '/dashboard', minLevel: 2, routes: ['/dashboard', '/jobload'], icon: 'dashboard' },
  ] },
  { heading: 'PEKERJAAN', items: [
    { label: 'Pekerjaan', href: '/tasks', minLevel: 1, routes: ['/tasks', '/kanban', '/timeline'], icon: 'tasks' },
    { label: 'Kalender', href: '/calendar', minLevel: 1, routes: ['/calendar'], icon: 'calendar' },
    { label: 'Persetujuan', href: '/review-inbox', minLevel: 3, routes: ['/review-inbox', '/approvals'], icon: 'approval' },
  ] },
  { heading: 'MONITORING', items: [
    { label: 'Laporan', href: '/reports', minLevel: 2, routes: ['/reports', '/audit-log'], icon: 'reports' },
  ] },
  { heading: 'PENGATURAN', items: [
    { label: 'Master Data', href: '/account', minLevel: 1, routes: ['/account', '/users', '/task-templates', '/org-structure', '/organizations', '/master-data'], icon: 'master' },
  ] },
]

export default function Sidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  return (
    <aside
      className="atm-sidebar w-full shrink-0 select-none border-b md:w-[var(--sidebar-width)] md:border-b-0 md:border-r"
      style={{ backgroundColor: 'var(--color-bg-sidebar)', borderColor: 'var(--color-hairline)' }}
    >
      <button type="button" className="atm-mobile-menu" aria-expanded={open} aria-controls="atm-primary-nav" onClick={()=>setOpen(!open)}>
        <NavIcon name="tasks" className="h-4 w-4" />
        <span>Menu</span><span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      <nav id="atm-primary-nav" aria-label="Navigasi utama" className={`atm-primary-nav ${open ? 'is-open' : ''}`}>
        <div className="atm-role-card">
          <span className="atm-eyebrow">Peran aktif</span>
          <strong>{user.role}</strong>
        </div>
        {GROUPS.map((group) => {
          const available = group.items.filter(item => user.roleLevel >= item.minLevel && (item.maxLevel === undefined || user.roleLevel <= item.maxLevel))
          if (available.length === 0) return null
          return (
            <div key={group.heading} className="shrink-0 md:w-full">
              <p className="atm-eyebrow hidden px-3 pb-2 !text-[10px] md:block">
                {group.heading}
              </p>
              <ul className="flex gap-1 md:flex-col">
                {available.map(item => {
                  const active = item.routes.some(route => pathname === route || pathname.startsWith(route + '/'))
                  return (
                    <li key={item.href} className="shrink-0">
                      <Link href={item.href} aria-current={active ? 'page' : undefined} onClick={()=>setOpen(false)}
                        className="atm-nav-link min-h-10 px-3 py-2 text-xs font-medium tracking-tight sm:text-sm md:w-full">
                        <NavIcon name={item.icon} className="h-[18px] w-[18px] shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
