export type Plan = { kind:'read'|'propose'|'help'|'clarify'; entity?:string; mode?:string; query?:string; task?:string; operation?:string; target?:string; data?:Record<string,string>; topic?:string; question?:string }
export type Operation = { label:string; entity:string; minimumRole:number; fields:Record<string,string>; required:string[]; task:boolean }
export type AssistantReply = { ok:boolean; message:string; path?:string; pending?:boolean; token?:string; changed?:boolean; rows?:Array<Record<string,unknown>>|Record<string,unknown>; duplicate?:boolean; history?:string[] }
const entities=new Set(['tasks','wbs','supports','requirements','comments','approvals','categories','templates','organizations','users','notifications','reminders','audit'])
export function validatePlan(value:unknown,catalog:Record<string,Operation>):Plan {
 if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error('Invalid plan')
 const p=value as Plan
 if(!['read','propose','help','clarify'].includes(p.kind)) throw new Error('Invalid kind')
 for(const k of ['query','target','topic','question','operation','task','mode','entity'] as const) if(p[k]!==undefined&&(typeof p[k]!=='string'||p[k]!.length>500)) throw new Error('Invalid value')
 if(p.kind==='read'&&(!entities.has(p.entity??'')||!['list','mine','review','calendar','mine_calendar','report'].includes(p.mode??'list'))) throw new Error('Invalid read')
 if(p.task&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(p.task)) throw new Error('Invalid task')
 if(p.kind==='propose') {
  const spec=Object.hasOwn(catalog,p.operation??'')?catalog[p.operation!]:undefined;if(!spec) throw new Error('Operation denied')
  if(!p.data||typeof p.data!=='object'||Array.isArray(p.data)) throw new Error('Invalid data')
  for(const [k,v] of Object.entries(p.data)) if(!Object.hasOwn(spec.fields,k)||typeof v!=='string'||v.length>2000) throw new Error('Invalid field')
  // New records and own-account actions never accept a model-selected target.
  if(['task_create','category_create','template_create','org_create','notification_all','profile_name'].includes(p.operation!))delete p.target
 }
 if(p.data)for(const key of ['mulai','tenggat']) {const value=p.data[key];if(value&&/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?\s+WIB$/i.test(value))p.data[key]=value.replace(/\s+WIB$/i,'').replace('T',' ')}
 return p
}
export function localPlan(text:string):Plan|null {
 const s=text.trim().toLowerCase()
 if(/^(halo|hai|hi|menu|bantuan|fitur)(\s|$)/.test(s)) return {kind:'help',topic:'tasks'}
 if(/cara|bagaimana|gimana|apa fungsi/.test(s)) {
  const topic=/hapus.*(akun|user)|role|undang|pengguna/.test(s)?'users':/kategori/.test(s)?'categories':/ulang/.test(s)?'templates':/organisasi/.test(s)?'organizations':/ekspor|export|laporan/.test(s)?'reports':/review|tinjau/.test(s)?'review':/kalender/.test(s)?'calendar':/password|sandi/.test(s)?'security':'tasks'
  return {kind:'help',topic}
 }
 if(/^(lihat|tampilkan|cek|cari|daftar)\b/.test(s)&&/tugas|task|pekerjaan/.test(s)) return {kind:'read',entity:'tasks',mode:/saya|pribadi/.test(s)?'mine':'list',query:/cari/.test(s)?text.replace(/^.*?cari\s+(?:tugas\s+)?/i,'').trim():''}
 const create=/^(?:tolong\s+)?buat(?:kan)?\s+tugas\s+["“]?(.+?)["”]?\s+mulai\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s+(?:tenggat|deadline)\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2})$/i.exec(text.trim())
 if(create)return {kind:'propose',operation:'task_create',data:{judul:create[1],mulai:create[2],tenggat:create[3]}}
 if(/^(laporan|ringkasan|rangkum)(\b|$)/.test(s)) return {kind:'read',entity:'tasks',mode:'report'}
 if(/^(kalender|tenggat minggu)/.test(s)) return {kind:'read',entity:'tasks',mode:'calendar'}
 const patterns:[RegExp,string][]=[[/^(?:tolong\s+)?(?:hapus)\s+(?:tugas\s+)?["“]?(.+?)["”]?$/i,'task_delete'],[/^(?:tolong\s+)?(?:ubah|update|tandai|tandain)\s+(?:tugas\s+)?["“]?(.+?)["”]?\s+(?:menjadi|jadi|ke)\s+(selesai|beres|done|berjalan|blocked|review|belum dimulai)$/i,'task_status']]
 for(const [re,op] of patterns) {const m=re.exec(text.trim());if(m) return {kind:'propose',operation:op,target:m[1],data:op==='task_status'?{status:({selesai:'Done',beres:'Done',done:'Done',berjalan:'In progress',blocked:'Blocked',review:'Review','belum dimulai':'To do'} as Record<string,string>)[m[2].toLowerCase()]}:{}}}
 return null
}
