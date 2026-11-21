import {localPlan,type Plan} from './contracts'
import {priorityValue} from './task-fields'
import {requestLanguage,featurePlan,statusValue} from './language'
import {normalizeTaskReference,taskMutationReference} from '@/lib/tasks/chat-intents'
export type GuidedDraft={operation:string;target?:string|null;payload:{guided?:boolean;field?:string;intentField?:string;data?:Record<string,string>;pic?:string;exact?:boolean;options?:Array<{label:string;value:string}>}}
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
 // Explicit everyday Indonesian mutations are parsed locally to avoid provider schema drift.
 const passivePriority=/^(?:mengubah|ubah|naikkan|naikin|turunkan|set|ganti)\s+prioritas(?:\s+(?:tugas|task))?\s+(.+?)(?:\s+(?:milik|punya)\s+(?:pic\s+)?(.+?))?\s+(?:(?:menjadi|jadi|ke|jd)\s+(rendah|sedang|tinggi))$/i.exec(text)
 if(passivePriority){const owner=passivePriority[2]?normalizeTaskReference(passivePriority[2]).text:undefined;const target=passivePriority[1].trim();return {kind:'propose',operation:'task_update',target,...(owner?{pic:owner}:{}),data:{prioritas:passivePriority[3].toLowerCase()}}}
 const missingPriority=/^(?:mengubah|ubah|edit|update)\s+prioritas(?:\s+(?:tugas|task))?\s+(.+)$/i.exec(text)
 if(missingPriority){const target=ref(missingPriority[1]);return {kind:'propose',operation:'task_update',...target,target:target.target,field:'prioritas',data:{}}}
 const informalProgress=/^(?:naikin|naikkan|ubah|update|set|ganti)\s+(?:progres|progress)(?:nya)?\s+(.+?)\s+(?:(?:jd|jadi|ke|menjadi)\\s*)(\\d{1,3})\\s*(?:%|persen)?$/i.exec(text)
 if(informalProgress){const target=ref(informalProgress[1]);return {kind:'propose',operation:'task_progress',...target,target:target.target,data:{progres:informalProgress[2]}}}
 const contextualReassign=/^(?:yang tadi|tugas tadi|task tadi)\\s+(?:ganti|ubah|pindahkan)\\s+(?:pic|penanggung jawab)(?:\\s*-?\\s*nya)?\\s+(?:ke|jadi|menjadi)\\s+(.+)$/i.exec(text)
 if(contextualReassign)return {kind:'propose',operation:'task_reassign',context:true,data:{pic:normalizeTaskReference(contextualReassign[1]).text}}
 const statusChange=/^(?:ubah|update|ganti|set|tandai)\\s+(?:status\\s+)?(?:tugas|task)\\s+(.+?)\\s+(?:(?:menjadi|jadi|ke)\\s+)(selesai|beres|done|berjalan|in progress|terhambat|tertunda|blocked|review|belum dimulai|to do)$/i.exec(text)
 if(statusChange){const reference=ref(statusChange[1]);const value=statusValue(statusChange[2])??({terhambat:'Blocked',tertunda:'Blocked','in progress':'In progress','to do':'To do'} as Record<string,string>)[statusChange[2].toLowerCase()];return {kind:'propose',operation:'task_status',...reference,target:reference.target,data:{status:value??'Blocked'}}}
 const wbs=/^(?:tambahkan|tambah|buat(?:kan)?)\\s+wbs\\s+(.+?)\\s+(?:ke|pada|di)\\s+(?:tugas|task)\\s+(.+)$/i.exec(text)
 if(wbs)return proposal('wbs_add',wbs[2],{nama:wbs[1]})
 const support=/^(?:(?:aku|saya|gue|gw)\s+)?(?:minta|butuh|perlu)\s+(?:bantuan|support)\s+(?:dari\s+)?(.+?)\s+(?:untuk|buat|di)\s+(?:tugas|task)\s+(.+)$/i.exec(text)
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
  const patch=/^(judul|nama|status|prioritas|mulai|tenggat|pic|kategori|seksi|aktif|tipe|induk|frekuensi|hari)(?:-?nya)?(?:\s+(?:jadi|menjadi|ke|adalah))?\s+(.+)$/i.exec(text)
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
 if(field==='prioritas'){const v=priorityValue(text.replace(/^(?:prioritas(?:-?nya)?\s*:?\s+)?(?:(?:jadi|menjadi|ke)\s+)?/i,''));return v?{prioritas:v}:{}}
 if(field==='alasan'&&(!/[a-z]/i.test(text)||text.length<3))return {}
 const fieldText=field==='pic'||field==='penerima'?text.replace(/^(?:ke|untuk|jadi|menjadi)\s+/i,''):text
 const value=normalizeTaskReference(fieldText.replace(new RegExp('^(?:judul(?:nya)?|nama(?:nya)?|PIC(?:-?nya)?|kategori(?:nya)?|seksi(?:nya)?|alasannya|alasan)(?:\\s+(?:jadi|menjadi|adalah))?\\s+','i'),'')).text
 return {[field]:value}
}
export function conversationPlan(message:string,draft?:GuidedDraft|null):Plan|null {
 let spoken=spokenPlan(message)
 if(draft?.payload.guided&&draft.payload.field==='update'&&(!spoken||(spoken.kind==='propose'&&spoken.context&&!spoken.target&&!draft.operation.startsWith('task_')))){
  const patch=/^(?:(?:ganti|ubah|edit)\s+)?(judul|nama|status|prioritas|mulai|tenggat|pic|kategori|seksi|aktif|tipe|induk|frekuensi|hari)(?:-?nya)?(?:\s+(?:jadi|menjadi|ke|adalah))?\s+(.+)$/i.exec(clean(message))
  if(patch&&!(/^(?:pic|status)$/i.test(patch[1])&&/^(?:tugas|task)\b/i.test(patch[2]))){const key=patch[1].toLowerCase(),isTask=draft.operation.startsWith('task_');const operation=isTask&&key==='status'?'task_status':isTask&&key==='pic'?'task_reassign':draft.operation;const value=key==='status'?statusValue(patch[2]):normalizeTaskReference(patch[2]).text;if(value)return {kind:'propose',operation,target:draft.target??undefined,context:!draft.target,data:{...(operation===draft.operation?draft.payload.data:{}),[key]:value}}}
 }
 if(!draft?.payload.guided)return spoken
 const data=draft.payload.data??{},field=draft.payload.field??''
 const intentField=draft.payload.intentField??(field==='update'||field==='target'?undefined:field)
 if(spoken&&spoken.kind!=='propose'&&!/^(?:lihat|liat|buka|bukain|cek|cari|carikan|tampilkan|tunjukkan|tunjukin|menu|bantuan|cara|bagaimana|gimana)\b|^(?:tugas|task)\s+(?:saya|aku|tim)\b/i.test(clean(message)))spoken=null
 if(draft.operation.startsWith('task_')&&/^(?:judul|nama(?: tugas| task)?|pic(?:-?nya)?)\s*:/i.test(message)&&/[,;\n]\s*(?:pic|penanggung jawab|judul|nama)/i.test(message))return {kind:'propose',operation:draft.operation,field:intentField,...ref(message),data}
 const reference=/^(?:tugas|task)(?:\s+berjudul)?\s+(.+)$/i.exec(clean(message))
 if(reference&&['task_create','template_create'].includes(draft.operation)&&field==='judul'){const title=ref(message);return {kind:'propose',operation:draft.operation,data:{...data,judul:title.target,...(title.pic?{pic:title.pic}:{})}}}
 if(reference&&spoken?.kind!=='propose'&&(field==='target'||/berjudul|[\"“”']/i.test(message)))return {kind:'propose',operation:draft.operation,field:intentField,...ref(message),data}
 if(spoken?.kind==='propose'&&spoken.operation==='task_update'&&draft.operation.startsWith('task_')&&draft.operation!=='task_update'&&Object.keys(spoken.data??{}).length===0)return {...spoken,operation:draft.operation,field:intentField,data}
 if(spoken?.kind==='propose'&&spoken.context&&draft.target&&draft.operation.startsWith('task_')&&spoken.operation?.startsWith('task_')&&spoken.operation!==draft.operation)return {...spoken,target:draft.target,context:false}
 if(spoken){
  if(spoken.kind!=='propose'||spoken.operation!==draft.operation)return spoken
  if(/^(?:buat|tambah)/i.test(clean(message)))return spoken
  return {...spoken,target:spoken.target??draft.target??undefined,context:spoken.target?spoken.context:!draft.target,field:spoken.field??intentField,data:{...data,...spoken.data}}
 }
 if(field==='target')return {kind:'propose',operation:draft.operation,field:intentField,...ref(message),data}
 const filled=answer(field,message,draft)
 return {kind:'propose',operation:draft.operation,target:draft.target??undefined,field:intentField,pic:draft.payload.pic??undefined,exact:draft.payload.exact??undefined,context:!draft.target&&field!=='target',data:{...data,...filled}}
}
