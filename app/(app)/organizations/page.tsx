import type { Metadata } from 'next'
import { getSessionUser } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import WorkspaceTabs, { MASTER_TABS } from '../_components/WorkspaceTabs'

export const metadata: Metadata = { title: 'Organizations' }
type Unit = { id:number; name:string; type:'department'|'unit'|'section'; parent_id:number|null }
type Member = { id:string; name:string; org_unit_id:number; supervisor_id:string|null; role_id:number }
export default async function OrganizationsPage() {
  const user=await getSessionUser()
  // Spectator's direct Data API remains restricted to their own profile.
  // This authenticated, read-only directory exposes only the selected public
  // organization fields below, never email, credentials, or task data.
  const supabase=user.roleLevel===1 ? createAdminClient() : await createClient()
  const [{data:rawUnits,error:unitError},{data:members,error:memberError},{data:roles,error:roleError}]=await Promise.all([
    supabase.from('org_units').select('id,name,type,parent_id').order('name'),
    supabase.from('users').select('id,name,org_unit_id,supervisor_id,role_id').eq('status','aktif'),
    supabase.from('roles').select('id,name'),
  ])
  if(unitError||memberError||roleError) throw new Error('Gagal memuat hierarki organisasi.')
  const units=(rawUnits??[]) as Unit[]
  const people=(members??[]) as Member[]
  const roleNames=new Map((roles??[]).map(r=>[r.id,r.name]))
  const peopleById=new Map(people.map(p=>[p.id,p]))
  const ordered:Array<Unit & {depth:number}>=[]
  const visited=new Set<number>()
  function visit(unit:Unit,depth:number){
    if(visited.has(unit.id))return
    visited.add(unit.id);ordered.push({...unit,depth})
    units.filter(child=>child.parent_id===unit.id).sort((a,b)=>a.name.localeCompare(b.name,'id')).forEach(child=>visit(child,depth+1))
  }
  units.filter(u=>u.parent_id===null).forEach(u=>visit(u,0))
  units.filter(u=>!visited.has(u.id)).forEach(u=>visit(u,0))
  function leadership(person:Member,role:string){
    const seen=new Set<string>()
    let current=person
    while(current.supervisor_id&&!seen.has(current.supervisor_id)){
      seen.add(current.supervisor_id)
      const next=peopleById.get(current.supervisor_id)
      if(!next)break
      if(roleNames.get(next.role_id)===role)return next.name
      current=next
    }
    return '—'
  }
  return <main className="w-full space-y-5 px-4 py-5 sm:px-6 lg:px-8">
    <WorkspaceTabs current="/organizations" tabs={MASTER_TABS} roleLevel={user.roleLevel}/>
    <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Organizations</h1>
    <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]">
      <table className="w-full min-w-[850px] text-left text-sm">
        <thead><tr>{['Organisasi','Level','Pengguna','Role','Atasan Langsung','Manager','SM'].map(x=><th key={x} className="px-3 py-3">{x}</th>)}</tr></thead>
        <tbody>{ordered.flatMap(unit=>{
          const assigned=people.filter(p=>p.org_unit_id===unit.id)
          return (assigned.length?assigned:[null]).map((person,index)=><tr key={unit.id+'-'+(person?.id??'empty')} className="border-t border-[var(--color-border)]">
            <td className="px-3 py-3 font-medium" style={{paddingLeft:12+unit.depth*20}}>{index===0?unit.name:'↳'}</td>
            <td className="px-3 py-3">{unit.type==='department'?'LV1':unit.type==='unit'?'LV2':'LV3'}</td>
            <td className="px-3 py-3">{person?.name??'—'}</td>
            <td className="px-3 py-3">{person?roleNames.get(person.role_id)??'—':'—'}</td>
            <td className="px-3 py-3">{person?.supervisor_id?peopleById.get(person.supervisor_id)?.name??'—':'—'}</td>
            <td className="px-3 py-3">{person?leadership(person,'Manager'):'—'}</td>
            <td className="px-3 py-3">{person?leadership(person,'SM'):'—'}</td>
          </tr>)
        })}</tbody>
      </table>
    </div>
  </main>
}
