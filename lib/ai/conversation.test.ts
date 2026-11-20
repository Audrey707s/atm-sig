import {describe,it,expect} from 'vitest'
import {spokenPlan,conversationPlan,type GuidedDraft} from './conversation'
describe('ordinary Indonesian conversations',()=>{
 it.each([
  ['tolong buka task nata',{kind:'read',pic:'nata'}],
  ['hapus tugas A milik nata',{operation:'task_delete',target:'A',pic:'nata'}],
  ['ganti PIC tugas "pertama" audrey menjadi "nata" ya',{operation:'task_reassign',target:'pertama',pic:'audrey',exact:true,data:{pic:'nata'}}],
  ['ganti PIC nya jadi nata',{operation:'task_reassign',context:true,data:{pic:'nata'}}],
  ['ganti PICnya nata',{operation:'task_reassign',context:true,data:{pic:'nata'}}],
  ['alihkan tugas \"pertama\" milik Audrey ke Nata',{operation:'task_reassign',target:'pertama',pic:'Audrey',data:{pic:'Nata'}}],
  ['ganti PIC-nya menjadi nata',{operation:'task_reassign',context:true,data:{pic:'nata'}}],
  ['loh ganti PIC-nya ke "nata"',{operation:'task_reassign',context:true,data:{pic:'nata'}}],
  ['buatkan tugas berulang untuk Audrey',{operation:'template_create',data:{pic:'Audrey'}}],
  ['buatkan tugas untuk nata ya',{operation:'task_create',data:{pic:'nata'}}],
  ['tugas saya apa saja',{kind:'read',mode:'mine'}],
  ['undur tenggat tugas "rekonsiliasi" ke besok jam 4 sore karena masih diperiksa',{operation:'task_deadline',target:'rekonsiliasi',data:{tenggat:'besok jam 4 sore',alasan:'masih diperiksa'}}],
 ] as const)('understands %s without model inference',(message,expected)=>expect(spokenPlan(message)).toMatchObject(expected))
 it('retains reassignment when a user repeats the target instead of answering a field',()=>{
  const draft:GuidedDraft={operation:'task_reassign',target:'11111111-1111-4111-8111-111111111111',payload:{guided:true,field:'alasan',data:{pic:'nata'}}}
  expect(conversationPlan('tugas berjudul "pertama" milik audrey',draft)).toMatchObject({operation:'task_reassign',target:'pertama',pic:'audrey',data:{pic:'nata'}})
  expect(conversationPlan('ganti PIC-nya menjadi nata',draft)).toMatchObject({operation:'task_reassign',target:draft.target,data:{pic:'nata'}})
  expect(conversationPlan('karena pekerjaan dialihkan ke nata',draft)).toMatchObject({operation:'task_reassign',target:draft.target,data:{pic:'nata',alasan:'karena pekerjaan dialihkan ke nata'}})
  expect(conversationPlan('2',draft)).toMatchObject({data:{pic:'nata'}})
 })
 it('accepts ordinary recurrence answers and numbered field options',()=>{
  const draft:GuidedDraft={operation:'template_create',payload:{guided:true,field:'frekuensi',data:{judul:'Rekon'},options:[{label:'Mingguan',value:'weekly'},{label:'Bulanan',value:'monthly'}]}}
  expect(conversationPlan('1',draft)).toMatchObject({data:{frekuensi:'weekly'}})
  draft.payload={...draft.payload,field:'hari',data:{frekuensi:'weekly'}};expect(conversationPlan('setiap Senin',draft)).toMatchObject({data:{hari:'1'}})
  draft.payload.field='mulai';expect(conversationPlan('hari yang sama',draft)).toMatchObject({data:{mulai:'0'}})
  draft.payload.field='tenggat';expect(conversationPlan('dua hari setelah jadwal',draft)).toMatchObject({data:{tenggat:'2'}})
 })
 it('treats a title answer as a value even when it starts with a menu name',()=>{
  const draft:GuidedDraft={operation:'task_create',payload:{guided:true,field:'judul',data:{pic:'Nata'}}}
  expect(conversationPlan('Laporan harian',draft)).toMatchObject({operation:'task_create',data:{judul:'Laporan harian',pic:'Nata'}})
  expect(conversationPlan('buka laporan',draft)).toMatchObject({kind:'help',topic:'reports'})
 })

})

it.each(['aku butuh bantuan Audrey buat tugas rekonsiliasi','saya perlu support dari Audrey untuk task rekonsiliasi','minta bantuan Audrey di tugas rekonsiliasi'])('resolves an existing-task support request without model quota: %s',message=>{
 expect(spokenPlan(message)).toMatchObject({kind:'propose',operation:'support_add',target:'rekonsiliasi',data:{penerima:'Audrey'}})
})
