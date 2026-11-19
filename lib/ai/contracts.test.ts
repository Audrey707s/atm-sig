import { describe,it,expect } from 'vitest'
import { localPlan,validatePlan,groundCreation,type Operation } from './contracts'
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
 it('does not mistake a task title containing cara for a help question',()=>{expect(localPlan('buat tugas Cara tutup buku mulai 2027-01-01 08:00 tenggat 2027-01-02 16:00')).toMatchObject({operation:'task_create',data:{judul:'Cara tutup buku'}})})
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

 it('asks for a title before planning a bare recipient-only creation request',()=>{
  expect(localPlan('buatkan tugas untuk nata ya')).toMatchObject({kind:'clarify',question:expect.stringContaining('judul')})
 })
 it('rejects invented titles and dates, but accepts ordinary grounded date and short time answers',()=>{
  const p={kind:'propose' as const,operation:'task_create',data:{judul:'Rekonsiliasi bank',mulai:'2026-11-17 08:00',tenggat:'2026-11-18 16:00'}}
  expect(groundCreation(p,['buat tugas untuk nata'])).toMatchObject({kind:'clarify'})
  expect(groundCreation(p,['buat tugas Rekonsiliasi bank untuk nata'])).toMatchObject({kind:'clarify',question:expect.stringContaining('mulai')})
  expect(groundCreation(p,['buat tugas Rekonsiliasi bank untuk nata','besok jam 8 pagi'])).toMatchObject({kind:'clarify'})
  expect(groundCreation(p,['buat tugas Rekonsiliasi bank untuk nata','besok jam 8 pagi sampai lusa jam 4 sore'])).toEqual(p)
  expect(groundCreation(p,['buat tugas Rekonsiliasi bank untuk nata','besok jam 8 pagi','16'])).toEqual(p)
 })

 it.each(['hapus tugas "pertama" ya','tolong hapus tugas “pertama” dong'])('keeps only an explicitly quoted deletion title: %s',message=>{
  expect(localPlan(message)).toMatchObject({operation:'task_delete',target:'pertama',exact:true,data:{}})
 })
 it('preserves politeness words inside a quoted title and distinguishes PIC from title searches',()=>{
  expect(localPlan('hapus tugas "Laporan ya" dong')).toMatchObject({target:'Laporan ya',exact:true})
  expect(localPlan('lihat tugas nata')).toMatchObject({kind:'read',pic:'nata',query:'nata'})
  expect(localPlan('lihat tugas milik nata')).toMatchObject({kind:'read',pic:'nata',query:''})
  expect(localPlan('lihat tugas nata yang masih open halaman 2')).toMatchObject({pic:'nata',mode:'open',page:'2'})
  expect(localPlan('cari tugas nata')).not.toHaveProperty('pic')
 })
 it('separates quoted title and PIC on mutation requests and preserves context references',()=>{
  expect(localPlan('hapus tugas "proker" milik nata ya')).toMatchObject({operation:'task_delete',target:'proker',pic:'nata',exact:true})
  expect(localPlan('edit tugas "pertama" milik audrey')).toMatchObject({operation:'task_update',target:'pertama',pic:'audrey',exact:true,data:{}})
  expect(localPlan('hapus ya')).toMatchObject({operation:'task_delete',context:true,target:undefined})
  expect(localPlan('hapus tugas')).toMatchObject({operation:'task_delete',context:true})
  expect(localPlan('delete tugas 2')).toMatchObject({operation:'task_delete',target:'2',exact:false})
  expect(localPlan('ganti judul jadi Judul baru')).toMatchObject({operation:'task_update',context:true,data:{judul:'Judul baru'}})
 })

})

it.each([
 ['lihat tugas "Ada deh" milik Sevtuari','Ada deh','Sevtuari'],
 ['buka task Ada deh punya Sevtuari','Ada deh','Sevtuari'],
 ['tolong tampilkan tugas "mengerjakan paper" milik PIC nata','mengerjakan paper','nata'],
])('keeps title and owner separate when the provider is unavailable: %s',(message,title,pic)=>{
 expect(localPlan(message)).toMatchObject({kind:'read',entity:'tasks',query:title,pic})
})
