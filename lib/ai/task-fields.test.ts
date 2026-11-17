import {describe,it,expect} from 'vitest'
import {spokenPlan,conversationPlan} from './conversation'
import {validatePlan} from './contracts'
import {taskMutationReference} from '@/lib/tasks/chat-intents'
const catalog={task_update:{label:'Ubah tugas',entity:'tasks',minimumRole:3,fields:{judul:'text',prioritas:'enum',mulai:'date',tenggat:'date'},required:[],task:true}}
const titles=['mengerjakan paper','"mengerjakan paper"','“mengerjakan paper”']
const verbs=['ubah','mengubah','ganti','update','perbarui']
const values=['tinggi','sedang','rendah']
const cases=titles.flatMap(title=>verbs.flatMap(verb=>values.flatMap(value=>[
 `${verb} prioritas tugas ${title} milik PIC nata menjadi ${value}`,
 `tugas ${title} milik PIC nata tolong diubah prioritasnya menjadi ${value}`,
 `tugas ${title} punya nata prioritasnya diganti menjadi ${value}`,
 `prioritas tugas ${title} milik nata diubah menjadi ${value}`,
].map(message=>({message,value})))))
describe('composable field requests in everyday Indonesian',()=>{
 it.each([...new Map(cases.map(item=>[item.message,item])).values()])('$message',({message,value})=>{
  const plan=validatePlan(spokenPlan(message),catalog)
  expect(plan).toMatchObject({operation:'task_update',target:'mengerjakan paper',pic:'nata',data:{prioritas:value}})
 })
 it('keeps the missing priority as an explicit request rather than a generic edit',()=>expect(spokenPlan('mengubah prioritas "mengerjakan paper"')).toMatchObject({operation:'task_update',field:'prioritas',target:'mengerjakan paper',data:{}}))
 it.each(['judul: mengerjakan paper, PIC-nya nata','judul: "mengerjakan paper", PIC-nya: nata','PIC: nata, judul: mengerjakan paper','judul: mengerjakan paper; penanggung jawab: nata'])('understands labelled references: %s',text=>{
  expect(taskMutationReference(text)).toMatchObject({target:'mengerjakan paper',pic:'nata'})
  expect(conversationPlan(text,{operation:'task_update',payload:{guided:true,field:'target',intentField:'prioritas',data:{}}})).toMatchObject({operation:'task_update',field:'prioritas',target:'mengerjakan paper',pic:'nata'})
 })
 it('does not treat syntax inside a quoted title as an instruction',()=>expect(spokenPlan('tugas "tolong diubah prioritasnya menjadi tinggi" milik nata diubah prioritasnya menjadi rendah')).toMatchObject({target:'tolong diubah prioritasnya menjadi tinggi',pic:'nata',data:{prioritas:'rendah'}}))
 it('accepts a short priority reply and keeps the selected target',()=>expect(conversationPlan('tinggi',{operation:'task_update',target:'selected',payload:{guided:true,field:'prioritas',intentField:'prioritas',data:{}}})).toMatchObject({target:'selected',data:{prioritas:'tinggi'}}))
 it('does not allow a field hint to introduce an unknown database field',()=>expect(()=>validatePlan({kind:'propose',operation:'task_update',field:'role_id',data:{}},catalog)).toThrow('Invalid requested field'))
})

it('does not consume the beginning of a target name as a possessive suffix',()=>expect(spokenPlan('ubah prioritas nyata milik nata menjadi tinggi')).toMatchObject({target:'nyata',pic:'nata',data:{prioritas:'tinggi'}}))

it.each(['category_update','org_update','template_update'])('keeps a contextual name edit in its selected master-data form: %s',operation=>expect(conversationPlan('nama jadi Data Baru',{operation,target:'chosen',payload:{guided:true,field:'update',data:{}}})).toMatchObject({operation,target:'chosen',data:{nama:'Data Baru'}}))
