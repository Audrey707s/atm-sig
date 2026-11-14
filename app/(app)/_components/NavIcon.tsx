/** Inline outline icons: no external font, network request, or runtime dependency. */
export type NavIconName = 'dashboard'|'tasks'|'approval'|'reports'|'master'|'kanban'|'timeline'|'user'|'users'|'calendar'|'audit'|'jobload'|'notification'|'structure'
export default function NavIcon({name,className='h-[18px] w-[18px]'}:{name:NavIconName;className?:string}) {
  const paths:Record<NavIconName,React.ReactNode>={
    dashboard:<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    tasks:<><rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 9 1.5 1.5L12 8M14 9h3M8 15h9"/></>,
    approval:<><path d="M8 3h8l3 3v14H5V6a3 3 0 0 1 3-3Z"/><path d="M8 12l3 3 5-5"/></>,
    reports:<><path d="M4 20h16M7 16v-6m5 6V5m5 11v-8"/><path d="M4 4v16"/></>,
    master:<><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></>,
    kanban:<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m6-16v16M5 8h2m4 0h2m4 0h2"/></>,
    timeline:<><path d="M4 5h16M4 11h10M4 17h16"/><circle cx="16" cy="11" r="2"/></>,
    user:<><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3-7 8-7s8 3 8 7"/></>,
    // Lucide Users (ISC), matching the Pengguna tab in AEMS.
    users:<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    calendar:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/></>,
    audit:<><path d="M5 4h14v16H5zM8 9h8m-8 4h8m-8 4h4"/></>,
    jobload:<><path d="M3 21h18M6 17v-6h4v6m4 0V6h4v11"/><path d="M3 8l5-4 5 2 6-4"/></>,
    notification:<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
    structure:<><rect x="9" y="2" width="6" height="5" rx="1"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/><path d="M12 7v5H5v5m7-5h7v5"/></>,
  }
  return <svg aria-hidden="true" focusable="false" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === 'users' ? 2 : 1.8} strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}
