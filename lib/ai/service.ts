import 'server-only'
import { createClient } from '@supabase/supabase-js'
import {rolloutEnabled} from './agent-policy'
import { planRequest } from './planner'
import {conversationPlan,type GuidedDraft} from './conversation'
import {aiRoleOperations,aiRoleReadAllowed} from './role-policy'
import { helpReply } from './knowledge'
import {containsAssistantSecret,validatePlan,type AssistantReply,type Operation,type Plan} from './contracts'
export function assistantStore() {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY
 if(!url||!key) throw new Error('Assistant store unavailable')
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
}
export type Turn = { actor:string; level:number; channel:'web'|'whatsapp'; phone?:string; receipt?:string; linkedAt?:string; threadId?:string; requestId?:string; agent?:{scope:string;request:string;lease:string;message:string;model?:string;input?:number;output?:number;started:number} }
export async function dispatch(turn:Turn,kind:string,payload:Record<string,unknown>={},token?:string):Promise<AssistantReply> {
 if(turn.agent&&kind!=='reserve'){
  const a=turn.agent
  const {data,error}=await assistantStore().rpc('atm_agent_execute',{p_actor:turn.actor,p_channel:turn.channel,p_scope:a.scope,p_request:a.request,p_lease:a.lease,p_kind:kind,p_payload:{...payload,_message:a.message,_model:a.model,_input:a.input??0,_output:a.output??0,_latency:Date.now()-a.started},p_token:token??null,p_phone:turn.phone??null,p_receipt:turn.receipt??null,p_generation:turn.linkedAt??null})
  if(error)throw new Error('Agent execution unavailable')
  return data as AssistantReply
 }
 const {data,error}=await assistantStore().rpc('atm_ai_turn',{p_actor:turn.actor,p_channel:turn.channel,p_kind:kind,p_payload:{...payload,...(turn.threadId?{threadId:turn.threadId}:{}),...(turn.channel==='whatsapp'?{linkGeneration:turn.linkedAt}:{})},p_token:token??null,p_phone:turn.phone??null,p_receipt:turn.receipt??null})
 if(error) throw new Error('Assistant operation unavailable')
 return data as AssistantReply
}
export async function requestAssistant(turn:Turn,message:string,token?:string,historyOverride?:string[]):Promise<AssistantReply> {
 if(rolloutEnabled(turn.actor,turn.level)){const {requestAgent}=await import('./orchestrator');return requestAgent(turn,message,token,historyOverride)}
 return requestLegacyAssistant(turn,message,token,historyOverride)
}
export async function requestLegacyAssistant(turn:Turn,message:string,token?:string,historyOverride?:string[],preparedPlan?:Plan):Promise<AssistantReply> {
 if(/^batal$/i.test(message.trim())) return dispatch(turn,'cancel')
 if(containsAssistantSecret(message))return dispatch(turn,'reply',{message:'Jangan kirim password atau API key melalui asisten. Gunakan pengaturan akun yang sesuai.'})
 const {data:stored,error:draftError}=await assistantStore().from('atm_ai_sessions').select('operation,target,payload,expires_at,conversation_id,phone,linked_at').eq('user_id',turn.actor).eq('channel',turn.channel).maybeSingle()
 if(draftError)throw new Error('Conversation state unavailable')
 const validDraft=stored&&Date.parse(stored.expires_at)>Date.now()&&(stored.conversation_id??null)===(turn.threadId??null)&&(turn.channel==='web'||(stored.phone===turn.phone&&stored.linked_at===turn.linkedAt))
 const draft:GuidedDraft|null=validDraft&&stored.payload?.guided?stored as GuidedDraft:validDraft&&stored.operation&&Array.isArray(stored.payload?.choices)&&!/^(?:(?:pilih|nomor|no\.?|yang)\s+)?[1-9]\d?$/i.test(message.trim())?{operation:stored.operation,payload:{guided:true,field:'target',data:stored.payload.data??{},intentField:stored.payload.intentField}}:null
 if(/^(ya|iya|konfirmasi|simpan(?: sekarang)?|oke simpan)$/i.test(message.trim())&&!['aktif','wajib','selesai','keputusan'].includes(draft?.payload.field??'')){
  if(draft)return dispatch(turn,'propose',{operation:draft.operation,field:draft.payload.intentField??(draft.payload.field==='target'||draft.payload.field==='update'?undefined:draft.payload.field),target:draft.target??undefined,data:draft.payload.data??{},pic:draft.payload.pic??undefined,exact:draft.payload.exact??undefined,context:!draft.target})
  return dispatch(turn,'confirm',{},token)
 }
 const local=conversationPlan(message,draft)
 const choice=/^(?:(?:pilih|nomor|no\.?|yang)\s+)?([1-9]\d?)$/i.exec(message.trim())
 const next=/^(?:lanjut|berikutnya|selanjutnya|halaman berikutnya|tampilkan berikutnya)$/i.test(message.trim())
 if((choice||next)&&!draft){
  const {data:selection}=await assistantStore().from('atm_ai_sessions').select('payload,expires_at,conversation_id').eq('user_id',turn.actor).eq('channel',turn.channel).maybeSingle()
  if(selection&&Date.parse(selection.expires_at)>Date.now()&&(selection.conversation_id??null)===(turn.threadId??null)){
   if(choice&&Array.isArray(selection.payload?.choices))return dispatch(turn,'select',{choice:Number(choice[1])})
   if(next&&selection.payload?.lastRead)return dispatch(turn,'read',{...selection.payload.lastRead,page:String(Number(selection.payload.lastRead.page??1)+1)})
  }
  if(choice){
   const {data:context}=await assistantStore().from('atm_ai_task_context').select('choices,expires_at,conversation_id').eq('user_id',turn.actor).eq('channel',turn.channel).maybeSingle()
   if(context&&Date.parse(context.expires_at)>Date.now()&&(context.conversation_id??null)===(turn.threadId??null)&&Array.isArray(context.choices)&&context.choices.length)return dispatch(turn,'select',{choice:Number(choice[1])})
  }
 }
 const reserved=await dispatch({...turn,channel:'web'},'reserve',{message,contextChannel:turn.channel,local:true})
 if(!reserved.ok) return dispatch(turn,'reply',{message:'Batas permintaan sementara tercapai. Tunggu satu menit lalu coba lagi.'})
 const {data,error}=await assistantStore().rpc('wa_operation_catalog')
 if(error) throw new Error('Catalogue unavailable')
 let plan:Plan
 if(!preparedPlan&&local?.kind==='propose'&&!Object.hasOwn(aiRoleOperations(turn.level,data as Record<string,Operation>),local.operation??''))return dispatch(turn,'reply',{message:'Role akun Anda tidak memiliki izin untuk aksi tersebut.'})
 try {plan=preparedPlan?validatePlan(preparedPlan,aiRoleOperations(turn.level,data as Record<string,Operation>)):local?validatePlan(local,aiRoleOperations(turn.level,data as Record<string,Operation>)):await planRequest(message,turn.level,data as Record<string,Operation>,historyOverride??reserved.history??[])}
 catch(error) {
  const reason=error as {name?:unknown;statusCode?:unknown;data?:{error?:{code?:unknown;type?:unknown}}}
  console.warn('[assistant] planning unavailable',{name:typeof reason?.name==='string'?reason.name:'Unknown',status:typeof reason?.statusCode==='number'?reason.statusCode:undefined,code:typeof reason?.data?.error?.code==='string'?reason.data.error.code:undefined,type:typeof reason?.data?.error?.type==='string'?reason.data.error.type:undefined})
  return dispatch(turn,'reply',{message:'Permintaan belum dapat diproses. Coba tulis judul/ID tugas dan perubahan secara lengkap, atau gunakan menu ATM. Tidak ada perubahan yang disimpan.'})}
 if(!aiRoleReadAllowed(turn.level,plan))return dispatch(turn,'reply',{message:'Role akun Anda tidak memiliki izin membaca fitur tersebut.'})
 if(plan.kind==='help') {const r=helpReply(plan.topic??'tasks',turn.level);return dispatch(turn,'reply',r)}
 if(plan.kind==='clarify') return dispatch(turn,'reply',{message:(plan.question??'Lengkapi judul/ID, isian, dan aksi yang diinginkan.').slice(0,1000)})
 if(plan.kind==='propose') return dispatch(turn,'propose',{operation:plan.operation,field:plan.field,target:plan.target,exact:plan.exact,pic:plan.pic,context:plan.context,data:plan.data})
 if(!preparedPlan&&plan.entity==='tasks'&&plan.mode==='mine'&&!/termasuk\s+(?:yang\s+)?selesai|sudah selesai|semua status/i.test(message))plan.mode='mine_open'
 if(plan.entity==='tasks'&&plan.mode==='calendar'&&/\b(saya|pribadi|milikku)\b/i.test(message))plan.mode='mine_calendar'
 if(plan.entity==='tasks'&&plan.mode==='report'&&!plan.pic&&/\b(?:saya|aku|pribadi)\b/i.test(message.replace(/["“][^"”]*["”]|'[^']*'/g,' ')))plan.pic=turn.actor
 return dispatch(turn,'read',{entity:plan.entity,query:plan.query,mode:plan.mode,task:plan.task,page:plan.page,pic:plan.pic})
}
