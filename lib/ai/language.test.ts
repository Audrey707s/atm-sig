import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {spokenPlan,conversationPlan} from './conversation'
import {validatePlan,type Operation} from './contracts'
const catalog=JSON.parse(readFileSync('supabase/migrations/20261116104627_ai_natural_task_actions.sql','utf8').split('$json$')[1]) as Record<string,Operation>
export const phrases:Record<string,string>={
 task_create:'bikinin tugas untuk PIC',task_update:'edit tugas "Task asal"',task_delete:'tugas "Task asal" milik PIC dihapus',task_duplicate:'salin tugas "Task asal"',task_status:'geserin tugas "Task asal" ke berjalan',task_review:'setujui tugas "Task asal"',task_comment:'kasih komentar di tugas "Task asal": sudah dicek',task_deadline:'undur tenggat tugas "Task asal" ke besok jam 4 sore',task_reassign:'pindahin tugas "Task asal" ke Manager',task_progress:'update progres "Task asal" jadi 50%',
 wbs_add:'tambahkan wbs "Cek saldo" di tugas "Task asal"',wbs_toggle:'centang wbs "Cek saldo"',support_add:'minta bantuan Manager untuk tugas "Task asal"',support_finish:'selesaikan support "Cek saldo"',evidence_requirement:'tambahkan syarat bukti "Laporan" di tugas "Task asal"',evidence_link:'tambahkan bukti https://example.test/bukti untuk "Laporan"',deadline_decide:'setujui permohonan tenggat "Task asal"',category_create:'buat kategori "Bulanan" di seksi Section Cost Accounting',category_update:'ubah kategori "Bulanan" jadi "Bulanan baru"',category_delete:'hapus kategori "Bulanan"',template_create:'buatkan tugas berulang untuk PIC',template_update:'ubah tugas berulang "Rutin" jadi "Rutin baru"',template_toggle:'nonaktifkan jadwal "Rutin"',template_delete:'hapus tugas berulang "Rutin"',org_create:'buat departemen "Baru"',org_update:'ubah organisasi "Baru" jadi "Baru sekali"',org_delete:'hapus organisasi "Baru"',notification_read:'tandai notifikasi "Pesan" dibaca',notification_all:'tandai semua notifikasi dibaca',reminder_response:'balas reminder "Task asal" dengan progres',profile_name:'ganti nama profil saya menjadi Nama Baru',
}
describe('every operation has a provider-independent everyday entry point',()=>{
 it('covers the complete current server catalogue without silently omitting a feature',()=>expect(Object.keys(phrases).sort()).toEqual(Object.keys(catalog).sort()))
 it.each(Object.entries(phrases))('%s: %s',(operation,text)=>{
  const plan=spokenPlan(text);expect(plan).toMatchObject({kind:'propose',operation});expect(()=>validatePlan(plan,catalog)).not.toThrow()
 })
 it.each(['tolong hapusin tugas A milik nata dong','tugas A milik nata dihapus','hapus tugas "A" milik "nata"','saya pengen hapus tugas A milik nata'])('understands active/passive informal deletion: %s',text=>expect(spokenPlan(text)).toMatchObject({operation:'task_delete',target:'A',pic:expect.stringMatching(/^nata$/i)}))
 it.each(['tolong bukain task nata','liatin tugas milik nata','lihat tugas nata'])('understands informal read: %s',text=>expect(spokenPlan(text)).toMatchObject({kind:'read',pic:'nata'}))
 it('preserves unquoted titles containing ordinary request verbs',()=>expect(spokenPlan('hapus tugas rencana pindah milik nata')).toMatchObject({target:'rencana pindah'}))
 it('does not normalize verbs inside quoted titles',()=>expect(spokenPlan('hapus tugas "bikinin hapusin geserin" milik nata')).toMatchObject({target:'bikinin hapusin geserin'}))
 it('keeps guided boolean answers as field values rather than creating another operation',()=>expect(conversationPlan('belum selesai',{operation:'wbs_toggle',target:'x',payload:{guided:true,field:'selesai',data:{}}})).toMatchObject({data:{selesai:'tidak'}}))
 it('supports passive kanban moves without confusing a status with a PIC',()=>expect(spokenPlan('tugas A milik nata dipindahkan ke berjalan')).toMatchObject({operation:'task_status',target:'A',pic:'nata',data:{status:'In progress'}}))
})

describe('reported status requests and owner-first task references',()=>{
 it.each(['ubah status task Ada deh milik Sevtuari menjadi Terhambat','mengubah status tugas "Ada deh" milik Sevtuari jadi terhambat','ganti status tugas Ada deh punya Sevtuari ke blocked','tugas "Ada deh" milik Sevtuari statusnya diubah menjadi Terhambat'])('recognizes %s',text=>expect(spokenPlan(text)).toMatchObject({operation:'task_status',target:'Ada deh',pic:'Sevtuari',data:{status:'Blocked'}}))
 it('retains status intent when the value is missing',()=>expect(spokenPlan('mengubah status tugas "Ada deh"')).toMatchObject({operation:'task_status',target:'Ada deh',exact:true,data:{}}))
 it('separates the owner before the quoted title',()=>expect(spokenPlan('mengubah tugas Sevtuari dengan nama "Ada deh"')).toMatchObject({operation:'task_update',target:'Ada deh',exact:true,pic:'Sevtuari'}))
 it('accepts a short status answer after a selected task',()=>expect(conversationPlan('Terhambat',{operation:'task_status',target:'id',payload:{guided:true,field:'status',data:{}}})).toMatchObject({operation:'task_status',target:'id',data:{status:'Blocked'}}))
 it('changes status from a general edit draft without submitting an invalid task_update field',()=>expect(conversationPlan('status jadi Terhambat',{operation:'task_update',target:'id',payload:{guided:true,field:'update',data:{}}})).toMatchObject({operation:'task_status',target:'id',data:{status:'Blocked'}}))
})

it('lets a fully specified status request override an older general edit target',()=>expect(conversationPlan('ubah status task Ada deh milik Sevtuari menjadi Terhambat',{operation:'task_update',target:'older-task',payload:{guided:true,field:'update',data:{}}})).toMatchObject({operation:'task_status',target:'Ada deh',pic:'Sevtuari',data:{status:'Blocked'}}))
