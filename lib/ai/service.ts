import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { planRequest } from './planner'
import { helpReply } from './knowledge'
import type { AssistantReply,Operation,Plan } from './contracts'
export function assistantStore() {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY
 if(!url||!key) throw new Error('Assistant store unavailable')
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
}
export type Turn = { actor:string; level:number; channel:'web'|'whatsapp'; phone?:string; receipt?:string; linkedAt?:string }
export async function dispatch(turn:Turn,kind:string,payload:Record<string,unknown>={},token?:string):Promise<AssistantReply> {
 const {data,error}=await assistantStore().rpc('atm_ai_turn',{p_actor:turn.actor,p_channel:turn.channel,p_kind:kind,p_payload:{...payload,...(turn.channel==='whatsapp'?{linkGeneration:turn.linkedAt}:{})},p_token:token??null,p_phone:turn.phone??null,p_receipt:turn.receipt??null})
 if(error) throw new Error('Assistant operation unavailable')
 return data as AssistantReply
}
export async function requestAssistant(turn:Turn,message:string,token?:string):Promise<AssistantReply> {
 if(/^(ya|konfirmasi)$/i.test(message.trim())) return dispatch(turn,'confirm',{},token)
 if(/^batal$/i.test(message.trim())) return dispatch(turn,'cancel')
 if(/(?:gsk_[a-z0-9]{20,}|sk-[a-z0-9]{20,}|(?:password|kata sandi|api[_ ]?key)\s*[:=])/i.test(message))return dispatch(turn,'reply',{message:'Jangan kirim password atau API key melalui asisten. Gunakan pengaturan akun yang sesuai.'})
 const reserved=await dispatch({...turn,channel:'web'},'reserve',{message,contextChannel:turn.channel})
 if(!reserved.ok) return dispatch(turn,'reply',{message:'Batas permintaan sementara tercapai. Tunggu satu menit lalu coba lagi.'})
 const {data,error}=await assistantStore().rpc('wa_operation_catalog')
 if(error) throw new Error('Catalogue unavailable')
 let plan:Plan
 try {plan=await planRequest(message,turn.level,data as Record<string,Operation>,reserved.history??[])}
 catch {return dispatch(turn,'reply',{message:'Permintaan belum dapat diproses. Coba tulis judul/ID tugas dan perubahan secara lengkap, atau gunakan menu ATM. Tidak ada perubahan yang disimpan.'})}
 if(plan.kind==='help') {const r=helpReply(plan.topic??'tasks',turn.level);return dispatch(turn,'reply',r)}
 if(plan.kind==='clarify') return dispatch(turn,'reply',{message:(plan.question??'Lengkapi judul/ID, isian, dan aksi yang diinginkan.').slice(0,1000)})
 if(plan.kind==='propose') return dispatch(turn,'propose',{operation:plan.operation,target:plan.target,data:plan.data})
 if(plan.entity==='tasks'&&plan.mode==='calendar'&&/\b(saya|pribadi|milikku)\b/i.test(message))plan.mode='mine_calendar'
 return dispatch(turn,'read',{entity:plan.entity,query:plan.query,mode:plan.mode,task:plan.task})
}
