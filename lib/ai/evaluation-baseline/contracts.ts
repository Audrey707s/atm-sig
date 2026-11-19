import {taskReadIntent,normalizeTaskReference,taskMutationReference} from './chat-intents'
export type Plan = { kind:'read'|'propose'|'help'|'clarify'; entity?:string; mode?:string; query?:string; pic?:string; exact?:boolean; context?:boolean; page?:string; task?:string; operation?:string; field?:string; target?:string; data?:Record<string,string>; topic?:string; question?:string }
export type Operation = { label:string; entity:string; minimumRole:number; fields:Record<string,string>; required:string[]; task:boolean }
export type AssistantReply = { ok:boolean; message:string; path?:string; pending?:boolean; token?:string; changed?:boolean; rows?:Array<Record<string,unknown>>|Record<string,unknown>; duplicate?:boolean; selection?:boolean; history?:string[] }
const entities=new Set(['tasks','wbs','supports','requirements','comments','approvals','categories','templates','organizations','users','notifications','reminders','audit'])
export function validatePlan(value:unknown,catalog:Record<string,Operation>):Plan {
 if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error('Invalid plan')
 const p=value as Plan
 if(!['read','propose','help','clarify'].includes(p.kind)) throw new Error('Invalid kind')
 for(const k of ['query','target','topic','question','operation','task','mode','entity','page','pic'] as const) if(p[k]!==undefined&&(typeof p[k]!=='string'||p[k]!.length>500)) throw new Error('Invalid value')
 if(p.kind==='read'&&(!entities.has(p.entity??'')||!['list','mine','review','calendar','mine_calendar','mine_open','open','report'].includes(p.mode??'list'))) throw new Error('Invalid read')
 if(p.context!==undefined&&typeof p.context!=='boolean')throw new Error('Invalid context')
 if(p.exact!==undefined&&typeof p.exact!=='boolean')throw new Error('Invalid exact match')
 if(p.target){const target=taskMutationReference(p.target);p.target=target.context?undefined:target.target;if(target.exact)p.exact=true;if(target.pic&&!p.pic)p.pic=target.pic;if(target.context)p.context=true}
 if(p.page!==undefined&&!/^[1-9]\d{0,3}$/.test(p.page))throw new Error('Invalid page')
 if(p.task&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(p.task)) throw new Error('Invalid task')
 if(p.kind==='propose') {
  const spec=Object.hasOwn(catalog,p.operation??'')?catalog[p.operation!]:undefined;if(!spec) throw new Error('Operation denied')
  if(p.field!==undefined&&(typeof p.field!=='string'||!Object.hasOwn(spec.fields,p.field)))throw new Error('Invalid requested field')
  if(!p.data||typeof p.data!=='object'||Array.isArray(p.data)) throw new Error('Invalid data')
  for(const [k,v] of Object.entries(p.data)) if(!Object.hasOwn(spec.fields,k)||typeof v!=='string'||v.length>2000) throw new Error('Invalid field')
  // New records and own-account actions never accept a model-selected target.
  if(['task_create','category_create','template_create','org_create','notification_all','profile_name'].includes(p.operation!))delete p.target
 }
 if(p.data)for(const key of ['mulai','tenggat']) {const value=p.data[key];if(value&&/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?\s+WIB$/i.test(value))p.data[key]=value.replace(/\s+WIB$/i,'').replace('T',' ')}
 return p
}
export function localPlan(text:string):Plan|null {
 const clean=text.trim().replace(/^(?:(?:tolong|mohon|bantu|bisa|boleh)(?:\s+(?:saya|aku|kamu|anda))?\s+)+/i,'').replace(/[.!?]+$/,'')
 const s=clean.toLowerCase()
 const taskRead=taskReadIntent(clean)
 if(taskRead)return {kind:'read',entity:'tasks',...taskRead}
 if(/^(?:(?:saya\s+)?(?:mau|ingin)\s+)?(?:buat(?:kan)?|tambah(?:kan)?)\s+(?:tugas|task)(?:\s+baru)?(?:\s+untuk\s+.+?)?(?:\s+(?:ya|dong))?$/i.test(clean))return {kind:'clarify',question:'Apa judul tugas yang ingin dibuat? Balas dengan judulnya saja; setelah itu saya bantu lengkapi PIC, mulai, dan tenggat.'}
 const progress=/^(?:(?:ubah|update|perbarui|naikkan|turunkan|set|ganti)\s+)?(?:progres|progress|progresnya|progressnya)\s+(?:tugas\s+)?["“]?(.+?)["”]?\s+(?:(?:menjadi|jadi|ke|sebesar)\s+)?(\d{1,3})\s*(?:%|persen)?$/i.exec(clean)
 if(progress)return {kind:'propose',operation:'task_progress',target:progress[1],data:{progres:progress[2]}}
 const progressAfter=/^(?:ubah|update|perbarui|set|ganti)\s+(?:tugas\s+)?["“]?(.+?)["”]?\s+(?:progres|progress)(?:nya)?\s+(?:(?:menjadi|jadi|ke)\s+)?(\d{1,3})\s*(?:%|persen)?$/i.exec(clean)
 if(progressAfter)return {kind:'propose',operation:'task_progress',target:progressAfter[1],data:{progres:progressAfter[2]}}
 if(/^(?:ubah|update|perbarui)\s+(?:progres|progress)\s+/i.test(clean))return {kind:'clarify',question:'Berapa persen progres yang ingin disimpan? Sebutkan judul atau kata kunci tugas dan persentasenya, misalnya “progres rekonsiliasi jadi 70%”.'}
 const menu=/^(?:(?:buka|lihat|tampilkan|akses|masuk ke)\s+)?(?:menu|halaman)?\s*(dashboard|dasbor|kanban|papan|linimasa|timeline|kinerja|evaluasi kinerja|persetujuan|audit|riwayat aktivitas|profil(?: saya)?|akun(?: saya)?|organisasi|organizations|kategori(?: tugas)?|tugas berulang|kalender|calendar|laporan|pengguna|notifikasi|keamanan|password)$/i.exec(clean)
 if(menu){const topic:Record<string,string>={kanban:'kanban',papan:'kanban',linimasa:'timeline',timeline:'timeline',kinerja:'performance','evaluasi kinerja':'performance',persetujuan:'approvals',audit:'audit','riwayat aktivitas':'audit',dashboard:'dashboard',dasbor:'dashboard',profil:'security','profil saya':'security',akun:'security','akun saya':'security',organisasi:'organizations',organizations:'organizations',kategori:'categories','kategori tugas':'categories','tugas berulang':'templates',kalender:'calendar',calendar:'calendar',laporan:'reports',pengguna:'users',notifikasi:'notifications',keamanan:'security',password:'security'};return {kind:'help',topic:topic[menu[1].toLowerCase()]}}
 if(/^(halo|hai|hi|menu|bantuan|fitur)(\s|$)/.test(s)) return {kind:'help',topic:'tasks'}
 if(/^(?:cara\b|bagaimana\b|gimana\b|apa fungsi\b)/.test(s)) {
  const topic=/hapus.*(akun|user)|role|undang|pengguna/.test(s)?'users':/kategori/.test(s)?'categories':/ulang/.test(s)?'templates':/organisasi/.test(s)?'organizations':/ekspor|export|laporan/.test(s)?'reports':/review|tinjau/.test(s)?'review':/kalender/.test(s)?'calendar':/password|sandi|keamanan|akun/.test(s)?'security':/wbs/.test(s)?'wbs':/support/.test(s)?'support':/bukti|evidence/.test(s)?'evidence':/notifikasi|reminder/.test(s)?'notifications':'tasks'
  return {kind:'help',topic}
 }
 const create=/^(?:tolong\s+)?buat(?:kan)?\s+tugas\s+["“]?(.+?)["”]?\s+mulai\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s+(?:tenggat|deadline)\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2})$/i.exec(text.trim())
 if(create)return {kind:'propose',operation:'task_create',data:{judul:create[1],mulai:create[2],tenggat:create[3]}}
 if(/^(laporan|ringkasan|rangkum)(\b|$)/.test(s)) return {kind:'read',entity:'tasks',mode:'report'}
 if(/^(kalender|tenggat minggu)/.test(s)) return {kind:'read',entity:'tasks',mode:'calendar'}
 if(/^(?:hapus|delete|buang)(?:\s+tugas)?$/i.test(clean))return {kind:'propose',operation:'task_delete',context:true,data:{}}
 const deletion=/^(?:hapus|delete|buang)\s+(?:tugas\s+)?(.+)$/i.exec(clean)
 if(deletion){const target=taskMutationReference(deletion[1]);return {kind:'propose',operation:'task_delete',...target,target:target.context?undefined:target.target,data:{}}}
 if(/^(?:edit|ubah|perbarui)(?:\s+tugas)?(?:\s+ya)?$/i.test(clean))return {kind:'propose',operation:'task_update',context:true,data:{}}
 const edit=/^(?:edit|ubah|perbarui)\s+tugas\s+(.+)$/i.exec(clean)
 if(edit){const reference=taskMutationReference(edit[1]);if(reference.exact||!/\b(?:jadi|menjadi|prioritas|tenggat|deadline|mulai)\b/i.test(edit[1]))return {kind:'propose',operation:'task_update',...reference,data:{}}}
 const rename=/^(?:ganti|ubah|edit)?\s*judul(?:nya)?\s+(?:(?:jadi|menjadi)\s+)?(.+)$/i.exec(clean)
 if(rename)return {kind:'propose',operation:'task_update',context:true,data:{judul:normalizeTaskReference(rename[1]).text}}
 const patterns:[RegExp,string][]=[[/^(?:tolong\s+)?(?:ubah|update|tandai|tandain)\s+(?:tugas\s+)?["“]?(.+?)["”]?\s+(?:menjadi|jadi|ke)\s+(selesai|beres|done|berjalan|blocked|review|belum dimulai)$/i,'task_status']]
 for(const [re,op] of patterns) {const m=re.exec(text.trim());if(m) return {kind:'propose',operation:op,target:m[1],data:op==='task_status'?{status:({selesai:'Done',beres:'Done',done:'Done',berjalan:'In progress',blocked:'Blocked',review:'Review','belum dimulai':'To do'} as Record<string,string>)[m[2].toLowerCase()]}:{}}}
 return null
}

export function containsAssistantSecret(message:string){return /(?:gsk_[a-z0-9]{20,}|sk-[a-z0-9]{20,}|(?:password|kata sandi|api[_ ]?key)\s*[:=])/i.test(message)}

/** Model plans are proposals; required creation values must originate in the conversation. */
export function groundCreation(plan:Plan,messages:string[]):Plan {
 if(plan.kind!=='propose'||plan.operation!=='task_create')return plan
 const source=messages.join('\n').toLowerCase().replace(/\s+/g,' ')
 const title=plan.data?.judul?.toLowerCase().replace(/\s+/g,' ').trim()
 if(!title||!source.includes(title))return {kind:'clarify',question:'Apa judul tugas yang ingin dibuat? Saya perlu judul dari Anda sebelum menyiapkan tugas.'}
 const dates=source.match(/\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|hari ini|besok|lusa|senin|selasa|rabu|kamis|jumat|sabtu|minggu depan|bulan depan|\d{1,2}\s+(?:januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember))\b/g)??[]
 const times=source.match(/\b(?:\d{1,2}[:.]\d{2}|(?:jam|pukul)\s*\d{1,2})\b/g)??[]
 if(dates.length===0)return {kind:'clarify',question:'Kapan tugas ini mulai? Anda bisa menjawab seperti “besok jam 8 pagi”.'}
 const bareHours=messages.filter(message=>/^(?:[01]?\d|2[0-3])(?:\s*(?:pagi|siang|sore|malam))?$/i.test(message.trim())).length
 if(times.length+bareHours<2)return {kind:'clarify',question:'Kapan mulai dan tenggatnya, termasuk jam (WIB)? Misalnya “besok jam 8 pagi sampai lusa jam 4 sore”. Saya tidak akan menentukan waktu tanpa jawaban Anda.'}
 return plan
}
