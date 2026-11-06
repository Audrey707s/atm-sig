'use server'

import { revalidatePath } from 'next/cache'
import { getSessionUser } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

type UnitType = 'department'|'unit'|'section'
type OrgInput = {id?:number;name:string;type:UnitType;parentId:number|null}

async function requireSuperAdmin() {
  const user=await getSessionUser()
  if(user.roleLevel!==6) throw new Error('Hanya Super Admin dapat mengubah organisasi.')
  return createClient()
}

export async function saveOrgUnit(input:OrgInput):Promise<{data?:{id:number};error?:string}> {
  try {
    const supabase=await requireSuperAdmin()
    const name=input.name.trim()
    if(!name||name.length<2||name.length>100||!['department','unit','section'].includes(input.type))return {error:'Nama atau tipe unit tidak valid.'}
    if(input.type==='department'&&input.parentId!==null)return {error:'Department tidak boleh memiliki induk.'}
    if(input.type!=='department'&&(!Number.isInteger(input.parentId)||Number(input.parentId)<=0))return {error:'Induk wajib dipilih.'}
    if(input.id!==undefined&&(!Number.isInteger(input.id)||input.id<=0))return {error:'ID organisasi tidak valid.'}
    const {data:units,error:unitsError}=await supabase.from('org_units').select('id,type,parent_id')
    if(unitsError)return {error:`Gagal memeriksa struktur: ${unitsError.message}`}
    if(input.type!=='department'){
      const parent=units?.find(u=>u.id===input.parentId)
      if(!parent||parent.type!==(input.type==='section'?'unit':'department'))return {error:'Induk tidak sesuai hierarki: Unit harus di bawah Departemen dan Seksi di bawah Unit.'}
    }
    if(input.id!==undefined){
      if(input.id===input.parentId)return {error:'Unit tidak dapat menjadi induknya sendiri.'}
      const descendants=new Set<number>([input.id]);let size=0
      while(size!==descendants.size){size=descendants.size;for(const u of units??[])if(u.parent_id!==null&&descendants.has(u.parent_id))descendants.add(u.id)}
      if(input.parentId!==null&&descendants.has(input.parentId))return {error:'Induk tidak boleh merupakan turunan unit yang diedit.'}
    }
    const q=input.id===undefined
      ? supabase.from('org_units').insert({name,type:input.type,parent_id:input.parentId}).select('id').single()
      : supabase.from('org_units').update({name,type:input.type,parent_id:input.parentId}).eq('id',input.id).select('id').single()
    const {data,error}=await q
    if(error||!data)return {error:error?.message??'Gagal menyimpan unit organisasi.'}
    revalidatePath('/org-structure');revalidatePath('/organizations');revalidatePath('/organizations');revalidatePath('/users')
    return {data:{id:data.id}}
  }catch(e) {return {error:e instanceof Error?e.message:'Penyimpanan organisasi tidak berhasil.'}}
}

export async function deleteOrgUnit(id:number):Promise<{data?:{success:true};error?:string}> {
  try {
    const supabase=await requireSuperAdmin()
    if(!Number.isInteger(id)||id<=0)return {error:'ID organisasi tidak valid.'}
    const {data,error}=await supabase.from('org_units').delete().eq('id',id).select('id').maybeSingle()
    if(error||!data)return {error:'Tidak dapat menghapus organisasi yang dipakai atau di luar cakupan.'}
    revalidatePath('/org-structure')
    return {data:{success:true}}
  }catch {return {error:'Penghapusan organisasi ditolak.'}}
}
