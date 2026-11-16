import {localPlan,type Plan} from './contracts'
import {requestLanguage,featurePlan,statusValue} from './language'
import {normalizeTaskReference,taskMutationReference} from '@/lib/tasks/chat-intents'
export type GuidedDraft={operation:string;target?:string|null;payload:{guided?:boolean;field?:string;data?:Record<string,string>;pic?:string;exact?:boolean;options?:Array<{label:string;value:string}>}}
function clean(text:string){return text.trim().replace(/^(?:(?:tolong|mohon|bantu|coba|bisa|boleh|loh|oh|oke)(?:\s+(?:saya|aku|kamu|anda))?\s+)+/i,'').replace(/[.!?]+$/,'').trim()}
function ref(text:string){return taskMutationReference(text.replace(/^(?:tugas|task)(?:\s+berjudul)?\s+/i,'').trim())}
function proposal(operation:string,reference:string,data:Record<string,string>):Plan{
 const target=reference.trim()?ref(reference):null
 return {kind:'propose',operation,data,...(target?{...target,target:target.context?undefined:target.target}:{context:true})}
}
export function spokenPlan(message:string):Plan|null {
 const text=requestLanguage(message)
 const feature=featurePlan(text)
 if(feature)return feature
 const reassignment=/^(?:ganti|ubah|pindahkan|alihkan|pindah)\s+(?:pic|penanggung jawab)(?:\s*-?\s*nya)?\s*(.*?)\s+(?:menjadi|jadi|ke)\s+(.+)$/i.exec(text)
 if(reassignment){const parts=reassignment[2].split(/\s+(?:karena|dengan alasan)\s+/i);return proposal('task_reassign',reassignment[1],{pic:normalizeTaskReference(parts[0]).text,...(parts[1]?{alasan:parts.slice(1).join(' ')}:{})})}
 const transfer=/^(?:pindahkan|alihkan|tugaskan)\s+(?:tugas|task)\s+(.+?)\s+(?:ke|kepada|untuk)\s+(.+)$/i.exec(text)
 if(transfer)return proposal('task_reassign',transfer[1],{pic:normalizeTaskReference(transfer[2]).text})
 const shortPic=/^(?:ganti|ubah)\s+(?:pic|penanggung jawab)(?:\s*-?\s*nya)?\s+(?!tugas\b|task\b)(.+)$/i.exec(text)
 if(shortPic)return proposal('task_reassign','',{pic:normalizeTaskReference(shortPic[1]).text})
 if(/^(?:ganti|ubah|pindahkan)\s+(?:pic|penanggung jawab)(?:\s*-?\s*nya)?(?:\s+tugas)?$/i.test(text))return proposal('task_reassign','',{})
 const recurring=/^(?:buat(?:kan)?|tambah(?:kan)?)\s+(?:tugas|task)\s+(?:berulang|rutin|recurring)\s*(.*)$/i.exec(text)
 const creation=/^(?:buat(?:kan)?|tambah(?:kan)?)\s+(?:tugas|task)(?:\s+baru)?\s*(.*)$/i.exec(text)
 if(recurring||creation){
  let tail=(recurring??creation)![1].replace(/\s+(?:ya|dong|deh)$/i,'').trim()
  const dates=!recurring?/^(.*?)\s+mulai\s+(.+?)\s+(?:tenggat|deadline|sampai)\s+(.+)$/i.exec(tail):null
  if(dates)tail=dates[1]
  const split=/^(.*?)\s*\buntuk\s+(.+)$/i.exec(tail)
  const dueOwner=dates?/^(.*?)\s+untuk\s+(.+)$/i.exec(dates[3]):null
  const title=normalizeTaskReference(split?split[1]:tail).text
  return {kind:'propose',operation:recurring?'template_create':'task_create',data:{...(title?{judul:title}:{}),...(split||dueOwner?{pic:normalizeTaskReference(split?split[2]:dueOwner![2]).text}:{}),...(dates?{mulai:dates[2],tenggat:dueOwner?dueOwner[1]:dates[3]}:{})}}
 }
 const deadline=/^(?:undur|ubah|ganti|perpanjang)\s+(?:tenggat|deadline)(?:-?nya)?\s*(.*?)\s+(?:ke|jadi|menjadi)\s+(.+)$/i.exec(text)
 if(deadline){const value=deadline[2].split(/\s+(?:karena|dengan alasan)\s+/i);return proposal('task_deadline',deadline[1],{tenggat:value[0],...(value[1]?{alasan:value.slice(1).join(' ')}:{})})}
 const comment=/^(?:tambah(?:kan)?|beri(?:kan)?|kasih)\s+komentar\s+(?:di|pada|untuk)\s+(?:tugas|task)\s+(.+?)\s*:\s*(.+)$/i.exec(text)
 if(comment)return proposal('task_comment',comment[1],{komentar:comment[2]})
 const review=/^(setujui|approve|revisi)\s+(?:tugas|task)\s+(.+)$/i.exec(text)
 if(review){const value=review[2].split(/\s+karena\s+/i);return proposal('task_review',value[0],{keputusan:/revisi/i.test(review[1])?'revisi':'setuju',...(value[1]?{komentar:value.slice(1).join(' ')}:{})})}
 const category=/^(?:buat(?:kan)?|tambah(?:kan)?)\s+kategori\s+(.+?)(?:\s+di\s+seksi\s+(.+))?$/i.exec(text)
 if(category)return {kind:'propose',operation:'category_create',data:{nama:normalizeTaskReference(category[1]).text,...(category[2]?{seksi:normalizeTaskReference(category[2]).text}:{})}}
 const support=/^(?:minta|butuh)\s+(?:bantuan|support)\s+(.+?)\s+(?:untuk|di)\s+(?:tugas|task)\s+(.+)$/i.exec(text)
 if(support)return proposal('support_add',support[2],{penerima:normalizeTaskReference(support[1]).text})
 const progress=/^(?:(?:ubah|update|perbarui)\s+)?(?:progress|progres)(?:-?nya)?\s+(.+)$/i.exec(text)
 const basic=localPlan(text)
 if(progress&&basic?.kind==='clarify')return proposal('task_progress',progress[1],{})
 return basic
}
const numberWords:Record<string,string>={nol:'0',satu:'1',dua:'2',tiga:'3',empat:'4',lima:'5',enam:'6',tujuh:'7',delapan:'8',sembilan:'9',sepuluh:'10'}
function number(text:string){const word=text.toLowerCase().match(/\b(nol|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)\b/);return text.match(/\d+/)?.[0]??(word?numberWords[word[1]]:undefined)}
function answer(field:string,message:string,draft:GuidedDraft):Record<string,string>{
 const text=message.trim(),data=draft.payload.data??{},options=draft.payload.options??[]
 const option=/^(?:pilih\s+)?([1-9]\d?)$/i.exec(text)
 const chosen=option?options[Number(option[1])-1]:options.find(o=>o.label.toLowerCase()===text.toLowerCase()||o.value.toLowerCase()===text.toLowerCase())
 if(chosen)return {[field]:chosen.value}
 if(field==='update'){
  const patch=/^(judul|nama|prioritas|mulai|tenggat|pic|kategori|seksi|aktif|tipe|induk|frekuensi|hari)(?:-?nya)?(?:\s+(?:jadi|menjadi|ke|adalah))?\s+(.+)$/i.exec(text)
  return patch?{[patch[1].toLowerCase()]:normalizeTaskReference(patch[2]).text}:{}
 }
 if(field==='status'){const value=statusValue(text.replace(/^(?:jadi|menjadi|ke)\s+/i,''));return value?{status:value}:{}}
 if(['aktif','selesai','wajib'].includes(field))return /^(?:ya|iya|aktif|selesai|wajib|sudah|sudah selesai)$/i.test(text)?{[field]:'ya'}:/^(?:tidak|nggak|enggak|belum|belum selesai|nonaktif|opsional)$/i.test(text)?{[field]:'tidak'}:{}
 if(field==='keputusan')return /^(?:ya|setuju|setujui|terima|approve)$/i.test(text)?{keputusan:'setuju'}:/^(?:tolak|ditolak|reject)$/i.test(text)?{keputusan:'tolak'}:/revisi/i.test(text)?{keputusan:'revisi'}:{}
 if(field==='frekuensi'){const days=['senin','selasa','rabu','kamis','jumat','sabtu','minggu'];const day=days.findIndex(d=>(d!=='minggu'||/hari\s+minggu/i.test(text))&&new RegExp('\\b'+d+'\\b','i').test(text));if(/bulan|monthly|tanggal/i.test(text))return {frekuensi:'monthly',...(number(text)?{hari:number(text)!}:{})};if(day>=0)return {frekuensi:'weekly',hari:String(day+1)};if(/minggu|weekly|pekan/i.test(text))return {frekuensi:'weekly'};return {}}
 if(field==='hari'){
  const days=['senin','selasa','rabu','kamis','jumat','sabtu','minggu'];const day=days.findIndex(d=>new RegExp('\\b'+d+'\\b','i').test(text))
  const n=data.frekuensi==='weekly'&&day>=0?String(day+1):number(text);return n?{hari:n}:{}
 }
 if(['mulai','tenggat'].includes(field)&&draft.operation.startsWith('template_')){
  if(/hari (?:yang )?sama|langsung|tanpa jeda/i.test(text))return {[field]:'0'}
  const n=number(text);return n?{[field]:n}:{}
 }
 if(field==='progres'||field==='bobot'){const n=number(text);return n?{[field]:n}:{}}
 if(field==='prioritas'){const v=/tinggi|mendesak|urgent/i.test(text)?'tinggi':/rendah|low/i.test(text)?'rendah':/sedang|normal|medium/i.test(text)?'sedang':undefined;return v?{prioritas:v}:{}}
 if(field==='alasan'&&(!/[a-z]/i.test(text)||text.length<3))return {}
 const fieldText=field==='pic'||field==='penerima'?text.replace(/^(?:ke|untuk|jadi|menjadi)\s+/i,''):text
 const value=normalizeTaskReference(fieldText.replace(new RegExp('^(?:judul(?:nya)?|nama(?:nya)?|PIC(?:-?nya)?|kategori(?:nya)?|seksi(?:nya)?|alasannya|alasan)(?:\\s+(?:jadi|menjadi|adalah))?\\s+','i'),'')).text
 return {[field]:value}
}
export function conversationPlan(message:string,draft?:GuidedDraft|null):Plan|null {
 if(draft?.payload.guided&&draft.payload.field==='update'){
  const patch=/^(?:(?:ganti|ubah|edit)\s+)?(judul|nama|prioritas|mulai|tenggat|pic|kategori|seksi|aktif|tipe|induk|frekuensi|hari)(?:-?nya)?(?:\s+(?:jadi|menjadi|ke|adalah))?\s+(.+)$/i.exec(clean(message))
  if(patch)return {kind:'propose',operation:draft.operation,target:draft.target??undefined,data:{...draft.payload.data,[patch[1].toLowerCase()]:normalizeTaskReference(patch[2]).text}}
 }
 let spoken=spokenPlan(message)
 if(!draft?.payload.guided)return spoken
 const data=draft.payload.data??{},field=draft.payload.field??''
 if(spoken&&spoken.kind!=='propose'&&!/^(?:lihat|liat|buka|bukain|cek|cari|carikan|tampilkan|tunjukkan|tunjukin|menu|bantuan|cara|bagaimana|gimana)\b|^(?:tugas|task)\s+(?:saya|aku|tim)\b/i.test(clean(message)))spoken=null
 const reference=/^(?:tugas|task)(?:\s+berjudul)?\s+(.+)$/i.exec(clean(message))
 if(reference&&['task_create','template_create'].includes(draft.operation)&&field==='judul'){const title=ref(message);return {kind:'propose',operation:draft.operation,data:{...data,judul:title.target,...(title.pic?{pic:title.pic}:{})}}}
 if(reference&&(field==='target'||/berjudul|[\"“”']/i.test(message)))return {kind:'propose',operation:draft.operation,...ref(message),data}
 if(spoken){
  if(spoken.kind!=='propose'||spoken.operation!==draft.operation)return spoken
  if(/^(?:buat|tambah)/i.test(clean(message)))return spoken
  return {...spoken,target:spoken.target??draft.target??undefined,context:spoken.target?spoken.context:!draft.target,data:{...data,...spoken.data}}
 }
 if(field==='target')return {kind:'propose',operation:draft.operation,...ref(message),data}
 const filled=answer(field,message,draft)
 return {kind:'propose',operation:draft.operation,target:draft.target??undefined,pic:draft.payload.pic??undefined,exact:draft.payload.exact??undefined,context:!draft.target&&field!=='target',data:{...data,...filled}}
}
