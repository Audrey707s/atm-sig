import { describe,it,expect } from 'vitest'
import { localPlan,validatePlan,type Operation } from './contracts'
import { helpReply,allowedKnowledge } from './knowledge'
const catalog:Record<string,Operation>={task_status:{label:'Status',entity:'tasks',minimumRole:2,fields:{status:'Status'},required:['status'],task:true}}
describe('AI intent boundary',()=>{
 it('parses ordinary Indonesian requests without any model or API cost',()=>{
  expect(localPlan('lihat tugas saya')).toMatchObject({kind:'read',mode:'mine'})
  expect(localPlan('tolong tandain tugas PPN Oktober jadi beres')).toMatchObject({kind:'propose',operation:'task_status',target:'PPN Oktober',data:{status:'Done'}})
  expect(localPlan('ringkasan tugas')).toMatchObject({mode:'report'})
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
