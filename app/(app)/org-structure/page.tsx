import type { Metadata } from 'next'
import { getSessionUser, requireRole } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import WorkspaceTabs, { MASTER_TABS } from '../_components/WorkspaceTabs'
import OrgManagement from './OrgManagement'

export const metadata: Metadata = { title: 'Struktur Organisasi' }
type Unit = { id:number; name:string; type:'department'|'unit'|'section';parent_id:number|null }
const levelName={department:'LV 1 · Departemen',unit:'LV 2 · Unit',section:'LV 3 · Seksi'} as const
export default async function OrganizationStructurePage() {
  const user = await getSessionUser()
  requireRole(user,'SM')
  const supabase = await createClient()
  const {data,error}=await supabase.from('org_units').select('id,name,type,parent_id').order('name')
  if(error) throw new Error('Gagal memuat master struktur organisasi.')
  const units = (data ?? []) as Unit[]
  const byParent = (parentId:number|null) => units.filter(unit=>unit.parent_id===parentId)
    .sort((a,b)=>a.name.localeCompare(b.name,'id'))
  const ordered: Array<Unit & { depth:number }> = []
  const seen = new Set<number>()
  const visit = (unit:Unit, depth:number) => {
    if(seen.has(unit.id))return
    seen.add(unit.id)
    ordered.push({...unit,depth})
    byParent(unit.id).forEach(child=>visit(child,depth+1))
  }
  byParent(null).forEach(unit=>visit(unit,0))
  units.filter(unit=>!seen.has(unit.id)).forEach(unit=>visit(unit,0))
  return <main className="w-full space-y-5 px-4 pt-5 pb-6 sm:px-6 lg:px-8">
    <WorkspaceTabs current="/org-structure" tabs={MASTER_TABS} roleLevel={user.roleLevel} />
    <header><h1 className="text-xl font-bold text-[var(--color-text-primary)]">Struktur Organisasi</h1>
    </header>
    {user.roleLevel === 6 ? <OrgManagement units={ordered} /> : <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead className="bg-[var(--color-bg-app)] text-[var(--color-text-secondary)]"><tr><th className="px-4 py-3">Nama</th><th className="px-4 py-3">Level</th><th className="px-4 py-3">Induk</th></tr></thead>
        <tbody>{ordered.map(unit=><tr key={unit.id} className="border-t border-[var(--color-border)] text-[var(--color-text-primary)]">
          <td className="px-4 py-3 font-semibold"><span style={{paddingLeft:`${unit.depth*22}px`}} className="inline-block">{unit.depth>0?'↳ ':''}{unit.name}</span></td><td className="px-4 py-3">{levelName[unit.type]}</td><td className="px-4 py-3">{units.find(parent=>parent.id===unit.parent_id)?.name??'—'}</td>
        </tr>)}
        {!ordered.length&&<tr><td colSpan={3} className="p-8 text-center">Struktur organisasi belum tersedia.</td></tr>}</tbody>
      </table>
    </div>}
  </main>
}
