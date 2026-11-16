import { describe,it,expect } from 'vitest'
import { localPlan,validatePlan,type Operation } from './contracts'
import { helpReply,allowedKnowledge } from './knowledge'
const catalog:Record<string,Operation>={task_status:{label:'Status',entity:'tasks',minimumRole:2,fields:{status:'Status'},required:['status'],task:true}}
describe('AI intent boundary',()=>{
 it.each(['tugas saya','daftar tugas saya','lihat list tugas saya','tolong tampilkan tugas saya','semua tugas saya'])('understands personal lists: %s',text=>{
  expect(localPlan(text)).toMatchObject({kind:'read',entity:'tasks',mode:'mine',query:''})
 })
 it.each(['daftar tugas','lihat daftar semua tugas','list tugas tim','lihat semua tugas'])('understands scoped lists: %s',text=>{
  expect(localPlan(text)).toMatchObject({kind:'read',entity:'tasks',mode:'list',query:''})
 })
 it.each(['tugas yang perlu saya review','lihat tugas untuk saya tinjau','tugas yang menunggu review','review saya'])('distinguishes assigned reviews: %s',text=>{
  expect(localPlan(text)).toMatchObject({kind:'read',entity:'tasks',mode:'review',query:''})
 })
 it('extracts explicit title searches and task detail IDs',()=>{
  expect(localPlan('carikan tugas Rekonsiliasi')).toMatchObject({kind:'read',query:'Rekonsiliasi'})
  expect(localPlan('detail tugas 11111111-1111-4111-8111-111111111111')).toMatchObject({kind:'read',query:'11111111-1111-4111-8111-111111111111'})
 })
 it('parses ordinary Indonesian requests without any model or API cost',()=>{
  expect(localPlan('lihat tugas saya')).toMatchObject({kind:'read',mode:'mine'})
  expect(localPlan('tolong tandain tugas PPN Oktober jadi beres')).toMatchObject({kind:'propose',operation:'task_status',target:'PPN Oktober',data:{status:'Done'}})
  expect(localPlan('ringkasan tugas')).toMatchObject({mode:'report'})
 })
 it.each(['update progress rekonsiliasi jadi 70%','tolong ubah progres rekonsiliasi ke 70 persen','progres rekonsiliasi 70','perbarui tugas rekonsiliasi progressnya jadi 70%'])('extracts keyword progress without a fixed command: %s',text=>{
  expect(localPlan(text)).toMatchObject({kind:'propose',operation:'task_progress',target:'rekonsiliasi',data:{progres:'70'}})
 })
 it('keeps explicit open filters, keywords and pages',()=>{
  expect(localPlan('tampilkan daftar tugas saya yang masih open halaman 2')).toMatchObject({kind:'read',mode:'mine_open',page:'2'})
  expect(localPlan('lihat tugas rekonsiliasi')).toMatchObject({kind:'read',query:'rekonsiliasi'})
  expect(localPlan('cari tugas rekonsiliasi halaman 3')).toMatchObject({kind:'read',query:'rekonsiliasi',page:'3'})
  expect(localPlan('update progress rekonsiliasi')).toMatchObject({kind:'clarify'})
  expect(localPlan('buka profil saya')).toMatchObject({kind:'help',topic:'security'})
  expect(localPlan('buka menu organisasi')).toMatchObject({kind:'help',topic:'organizations'})
 })
 it('does not parse confirmation as a model-generated action',()=>{
  expect(localPlan('YA')).toBeNull()
  expect(()=>validatePlan({kind:'confirm'},catalog)).toThrow()
  expect(()=>validatePlan({kind:'propose',operation:'execute_sql',data:{}},catalog)).toThrow()
 })
 it('rejects out-of-role tools, non-string fields, extra fields and prototype properties',()=>{
  for(const value of [{kind:'propose',operation:'task_delete',data:{}},{kind:'propose',operation:'constructor',data:{}},{kind:'propose',operation:'task_status',data:{status:100}},{kind:'propose',operation:'task_status',data:{actor:'admin'}},{kind:'propose',operation:'task_status',data:JSON.parse('{"__proto__":"admin"}')}]) expect(()=>validatePlan(value,catalog)).toThrow()
 })
 it('normalizes only explicit WIB timestamp suffixes, leaving recurrence offsets intact',()=>{
  const c={task_create:{label:'Create',entity:'tasks',minimumRole:2,fields:{mulai:'date',tenggat:'date'},required:[],task:false}}
  expect(validatePlan({kind:'propose',operation:'task_create',data:{mulai:'2026-11-14 08:00 WIB',tenggat:'2026-11-15T16:00 WIB'}},c).data).toEqual({mulai:'2026-11-14 08:00',tenggat:'2026-11-15 16:00'})
  expect(validatePlan({kind:'propose',operation:'task_create',data:{mulai:'2'}},c).data?.mulai).toBe('2')
 })
 it('discards model target hints for own-profile and record-creation actions',()=>{
  const c={profile_name:{label:'Own name',entity:'profile',minimumRole:1,fields:{nama:'Name'},required:['nama'],task:false}}
  expect(validatePlan({kind:'propose',operation:'profile_name',target:'profil saya',data:{nama:'Nama baru'}},c).target).toBeUndefined()
 })
 it('validates read entities, modes and bounded values',()=>{
  expect(()=>validatePlan({kind:'read',entity:'auth.users'},catalog)).toThrow()
  expect(()=>validatePlan({kind:'read',entity:'tasks',mode:'all_organizations'},catalog)).toThrow()
  expect(()=>validatePlan({kind:'read',entity:'tasks',query:'a'.repeat(501)},catalog)).toThrow()
 })
 it('filters feature guidance before exposing it to staff',()=>{
  expect(helpReply('users',2).ok).toBe(false)
  expect(allowedKnowledge(2).some(x=>x.topic==='users')).toBe(false)
  expect(helpReply('organizations',1)).toMatchObject({ok:true,path:'/organizations'})
 })
 it('routes helpdesk follow-up topics locally without model inference',()=>{
  expect(localPlan('Bagaimana cara menggunakan notifikasi & reminder?')).toMatchObject({kind:'help',topic:'notifications'})
  expect(localPlan('Bagaimana cara menggunakan WBS & progres?')).toMatchObject({kind:'help',topic:'wbs'})
  expect(localPlan('Bagaimana cara menggunakan akun & keamanan?')).toMatchObject({kind:'help',topic:'security'})
 })

})
