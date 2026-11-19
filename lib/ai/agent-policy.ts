import {createHash} from 'node:crypto'
import type {Plan,Operation} from './contracts'
import {validatePlan} from './contracts'
import {aiRoleOperations,aiRoleReadAllowed} from './role-policy'
export type AgentMemory={activeTask?:string;activePIC?:string;filters?:Record<string,string>;pending?:Plan[];queued?:Plan[];pendingToken?:string;summary?:string;recent?:Array<{role:string;text:string}>;verified?:Array<{operation:string;id?:string}>}
export type Candidate={id:string;title:string;pic:string;reviewer?:string;organization?:string;status:string;due?:string;priority?:string;score?:number}
export type AgentPlan={steps:Plan[];question?:string}
export function rolloutEnabled(actor:string,level:number){const flag=process.env.ATM_AGENT_V2??'off';if(flag==='off')return false;if(flag==='canary')return level===6;const n=Number(flag==='on'?100:flag);return n>0&&parseInt(createHash('sha256').update(actor).digest('hex').slice(0,8),16)%100<n}
export function validateAgentPlan(input:unknown,level:number,catalog:Record<string,Operation>,message?:string):AgentPlan{
 const p=input as AgentPlan;if(!p||!Array.isArray(p.steps)||p.steps.length>5||p.steps.length===0)throw new Error('Invalid action count')
 const steps=p.steps.map(raw=>{const s=validatePlan({...structuredClone(raw),...(raw.kind==='propose'?{data:raw.data??{}}:{})},aiRoleOperations(level,catalog));if(!aiRoleReadAllowed(level,s))throw new Error('Read denied');return normalizeAgentRead(s,message)})
 return {steps,question:typeof p.question==='string'?p.question.slice(0,500):undefined}
}
const fold=(x:string)=>x.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()
function distance(a:string,b:string){let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const n=[i];for(let j=1;j<=b.length;j++)n[j]=Math.min(n[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=n}return row[b.length]}
export function resolveTask(plan:Plan,candidates:Candidate[],memory:AgentMemory):{candidate?:Candidate;confidence:number;ambiguous:Candidate[]}{
 const contextual=!plan.target||/^(ACTIVE_TASK|tugas tadi|yang itu|tugas itu|yang tadi|tadi)$/i.test(plan.target)
 const ref=contextual?memory.activeTask:plan.target
 let pool=candidates,ownerConfidence=1
 if(plan.pic&&/^(dia|punya dia|PIC tadi)$/i.test(plan.pic)){if(!memory.activePIC)return {confidence:0,ambiguous:[]};plan={...plan,pic:memory.activePIC}}
 if(plan.pic){const owner=fold(plan.pic);const exact=pool.filter(c=>fold(c.pic)===owner);if(!exact.length)ownerConfidence=.9;pool=exact.length?exact:pool.filter(c=>fold(c.pic).includes(owner)||distance(fold(c.pic),owner)<=1)}
 if(!ref)return {confidence:0,ambiguous:pool.slice(0,5)}
 const id=pool.filter(c=>c.id===ref);if(id.length===1)return {candidate:id[0],confidence:ownerConfidence,ambiguous:[]}
 const q=fold(ref),exact=pool.filter(c=>fold(c.title)===q);if(exact.length===1)return {candidate:exact[0],confidence:ownerConfidence,ambiguous:[]};if(exact.length>1)return {confidence:0,ambiguous:exact}
 const stripped=q.replace(/^(?:tugas|task|pekerjaan)(?: berjudul| dengan judul| dengan nama)? /,'')
 if(stripped!==q){const matches=pool.filter(c=>fold(c.title)===stripped);if(matches.length===1)return {candidate:matches[0],confidence:Math.min(.94,ownerConfidence),ambiguous:[]};if(matches.length>1)return {confidence:0,ambiguous:matches}}
 const ranked=pool.map(c=>{const t=fold(c.title),tokens=q.split(' ').filter(Boolean),overlap=tokens.filter(w=>t.includes(w)).length/Math.max(1,tokens.length);return {c,s:t.includes(q)?.94:distance(t,q)<=2?.9:overlap*.85}}).filter(x=>x.s>.35).sort((a,b)=>b.s-a.s)
 if(ranked.length===1&&ranked[0].s>=.85)return {candidate:ranked[0].c,confidence:ranked[0].s,ambiguous:[]}
 if(ranked.length>1&&ranked[0].s-ranked[1].s>=.18&&ranked[0].s>=.9)return {candidate:ranked[0].c,confidence:ranked[0].s,ambiguous:[]}
 return {confidence:ranked[0]?.s??0,ambiguous:ranked.slice(0,5).map(x=>x.c)}
}
/** Server repeats this classification. A model cannot downgrade risk. */
export function lowRisk(plan:Plan){const fields=Object.keys(plan.data??{});return plan.kind==='propose'&&((plan.operation==='task_update'&&fields.length===1&&fields[0]==='prioritas')||(plan.operation==='task_progress'&&/^(?:[0-9]|[1-9][0-9])$/.test(plan.data?.progres??'')))}
export function memorySummary(m:AgentMemory){return JSON.stringify({activeTask:m.activeTask,activePIC:m.activePIC,filters:m.filters,queued:m.queued,pending:m.pending?.map(p=>({operation:p.operation,target:p.target,field:p.field,data:p.data})),verified:m.verified?.slice(-4)}).slice(0,4000)}

/** An explicit owner replaces the implicit personal-list owner; RLS still applies. */
export function normalizeAgentRead(plan:Plan,message?:string):Plan {
 if(plan.kind!=='read'||plan.entity!=='tasks')return plan
 // Older model output sometimes encodes an owner as a query filter; the backend
 // accepts only a plain title query and a separate owner, never a filter DSL.
 const encoded=(plan.query??'').replace(/\\(["'])/g,'$1')
 const literal=!!message&&message.includes(plan.query??'')
 const compound=!literal?/^title\s*:\s*["“](.+?)["”]\s+(?:AND|dan)\s+pic\s*:\s*(.+)$/i.exec(encoded):null
 if(compound){if(plan.pic&&fold(plan.pic)!==fold(compound[2]))throw new Error('Conflicting owners');plan={...plan,query:compound[1],pic:compound[2].trim()}}
 const ownerFilter=!literal?/^pic\s*:\s*(.+)$/i.exec(plan.query??''):null
 if(ownerFilter&&!plan.pic)plan={...plan,pic:ownerFilter[1].trim(),query:''}
 if(message&&/termasuk.*selesai|semua status/i.test(message)&&['open','mine_open'].includes(plan.mode??''))plan={...plan,mode:plan.mode==='mine_open'?'mine':'list'}
 if(!plan.pic?.trim())return plan
 const modes:Record<string,string>={mine:'list',mine_open:'open',mine_calendar:'calendar'}
 return modes[plan.mode??'']?{...plan,mode:modes[plan.mode!]}:plan
}

/** Safe offline follow-up: resolve only an already verified, singular task. */
export function contextualTaskRead(message:string,memory:AgentMemory):Plan|null {
 if(!memory.activeTask)return null
 const text=fold(message)
 const reference=/\b(yang tadi|tugas tadi|task tadi|yang itu|tugas itu|task itu|tugas tersebut|task tersebut)\b/.test(text)
 const question=/\b(kapan|berapa|siapa|apa|lihat|liat|buka|cek|tampilkan|tenggatnya|deadlinenya|statusnya|progresnya|prioritasnya|picnya)\b/.test(text)
 const mutation=/\b(ubah|diubah|ganti|diganti|hapus|dihapus|update|perbarui|pindah|pindahkan|naikkan|turunkan|jadikan|jadi|menjadi|tambahkan|buatkan)\b/.test(text)
 if(!reference||!question||mutation)return null
 return {kind:'read',entity:'tasks',mode:'list',query:memory.activeTask}
}

/** Free-text audit fields must come from user text, not a model's plausible filler. */
export function groundAgentFields(plan:Plan,message:string,memory:AgentMemory):Plan {
 if(plan.kind!=='propose'||!plan.data)return plan
 const source=fold([...(memory.recent??[]).filter(m=>m.role==='user').map(m=>m.text),message].join(' ')),data={...plan.data}
 for(const field of ['alasan','komentar','deskripsi','judul','nama']){
  const value=data[field];if(!value)continue
  const previous=memory.pending?.find(p=>p.operation===plan.operation)?.data?.[field]
  if(source.includes(fold(value))||(['judul','nama'].includes(field)&&previous===value))continue
  delete data[field]
 }
 // Canonical backend values are internal. Never invent an absent enum/number.
 const valueText=plan.target?message.toLowerCase().replace(plan.target.toLowerCase(),' '):message
 const current=fold(valueText).replace(/\b(?:bukan|jangan|tidak|gak|ga|nggak)\s+(?:jadi\s+)?(?:tinggi|sedang|rendah|high|medium|low)\b/g,''),pending=memory.pending?.find(p=>p.operation===plan.operation)?.data??{}
 for(const field of ['progres','prioritas','status']){
  const value=data[field];if(!value)continue
  const normalized=field==='progres'?/^\d{1,3}\s*(?:%|persen)?$/i.exec(value.trim())?.[0].replace(/\s*(?:%|persen)$/i,''):value
  const aliases:Record<string,string[]>={Blocked:['blocked','terhambat','tertunda'],Done:['done','selesai','beres','kelar'],'In progress':['in progress','berjalan','dikerjakan'],'To do':['to do','belum dimulai'],Review:['review','tinjau'],tinggi:['tinggi','high'],sedang:['sedang','medium'],rendah:['rendah','low']}
  const stated=normalized&&(field==='progres'?new RegExp('(?:^| )'+normalized+'(?: |$)').test(current):(aliases[normalized]??[normalized]).some(x=>new RegExp('(?:^| )'+fold(x)+'(?: |$)').test(current)))
  const replacement=field==='prioritas'&&['tinggi','sedang','rendah','high','medium','low'].some(x=>new RegExp('(?:^| )'+x+'(?: |$)').test(current))
  if(normalized&&(stated||pending[field]===normalized&&!replacement)){data[field]=normalized;continue}
  delete data[field]
 }
 const missingField=plan.field??(['prioritas','progres','status'].find(field=>Object.hasOwn(plan.data!,field)&&!data[field]&&new RegExp('\\b'+field+'(?:nya)?\\b','i').test(message)))
 return {...plan,...(missingField?{field:missingField}:{}),data}
}
