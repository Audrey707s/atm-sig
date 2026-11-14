'use client'

import { useState } from 'react'
import type { DashboardPerformance } from '@/lib/dashboard/queries'
import NavIcon, {type NavIconName} from './NavIcon'

type ProgressItem = { id: string | number; name: string; averageProgress: number; activeTasks: number; overdueTasks: number }

function ProgressPanel({ title, items, icon }: {title:string;items:ProgressItem[];icon:NavIconName}) {
  const [requestedPage, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(items.length / 5))
  const page = Math.min(requestedPage, pages)
  return <section className="atm-card flex flex-col" aria-label={title}>
    <div className="p-5 flex-1">
      <div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-sm"><NavIcon name={icon} className="h-4 w-4 text-[var(--color-text-muted)]"/>{title}</h2><span className="text-xs tabular-nums text-[var(--color-text-muted)]">{items.length}</span></div>
      {items.length===0 ? <p className="mt-4 text-sm text-slate-500">Belum ada task aktif dalam cakupan Anda.</p> : <ul className="atm-progress-list">
        {items.slice((page-1)*5,page*5).map(item=><li className="atm-progress-row" key={item.id}>
          <div className="atm-progress-meta"><span title={item.name}>{item.name}</span><span className="shrink-0 tabular-nums text-[var(--color-text-muted)]">{item.averageProgress}% · {item.activeTasks} aktif</span></div>
          <div className="atm-progress-track h-1.5" role="progressbar" aria-label={`Progress rata-rata ${item.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.averageProgress}><div className="atm-progress-fill h-full rounded-full" style={{width:`${Math.max(0,Math.min(100,item.averageProgress))}%`,backgroundColor:'var(--color-brand)'}}/></div>
          {item.overdueTasks>0&&<span className="text-[11px] text-red-700">{item.overdueTasks} task lewat tenggat</span>}
        </li>)}
      </ul>}
    </div>
    {pages>1&&<nav className="atm-pagination border-t border-[var(--color-border)]" aria-label={`Halaman ${title}`}><span>{page} dari {pages}</span><div className="atm-pagination-controls"><button type="button" aria-label={`${title} sebelumnya`} disabled={page===1} onClick={()=>setPage(page-1)}>←</button><button type="button" aria-label={`${title} berikutnya`} disabled={page===pages} onClick={()=>setPage(page+1)}>→</button></div></nav>}
  </section>
}

export default function PerformanceOverview({performance}:{performance:DashboardPerformance}) {
  return <section aria-label="Progress per PIC dan section" className="grid gap-4 lg:grid-cols-2">
    <ProgressPanel title="Progress per PIC" items={performance.owners} icon="users"/>
    <ProgressPanel title="Progress per Section/Unit" items={performance.orgUnits} icon="structure"/>
  </section>
}
