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
})
