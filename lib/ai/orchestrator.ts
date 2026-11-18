import 'server-only'
import {createHash,randomUUID} from 'node:crypto'
import {assistantStore,dispatch,requestLegacyAssistant,type Turn} from './service'
import {modelPlan,modelConfigured} from './agent-model'
import {containsAssistantSecret,groundCreation,type Operation,type Plan,type AssistantReply} from './contracts'
import {resolveTask,type AgentMemory,type Candidate} from './agent-policy'

type StoredMemory=AgentMemory&{draft?:{operation?:string;target?:string;payload?:Record<string,unknown>};context?:{task_id?:string}}
/** The provider only plans. All writes still pass through the existing authenticated SQL executor. */
export async function requestAgent(turn:Turn,message:string,token?:string,history?:string[]):Promise<AssistantReply>{
 const started=Date.now(),store=assistantStore(),scope=turn.channel==='web'?(turn.threadId??'default'):turn.phone??''
 const request=turn.receipt??turn.requestId??randomUUID()
 const hash=createHash('sha256').update(JSON.stringify({message,token:token??null})).digest('hex')
 const {data:claim,error}=await store.rpc('atm_agent_claim',{p_actor:turn.actor,p_channel:turn.channel,p_scope:scope,p_request:request,p_hash:hash,p_phone:turn.phone??null,p_generation:turn.linkedAt??null})
 if(error||!claim)throw new Error('Conversation claim unavailable')
 if(claim.cached)return {...claim.cached,duplicate:true}
 const trusted:Turn={...turn,agent:{scope,request,lease:claim.lease,message:containsAssistantSecret(message)?'[Pesan rahasia tidak disimpan]':message,started}}
 const memory:StoredMemory=claim.memory??{}
 memory.activeTask=memory.context?.task_id??memory.activeTask
 if(memory.draft?.operation)memory.pending=[{kind:'propose',operation:memory.draft.operation,target:memory.draft.target,data:(memory.draft.payload?.data??memory.draft.payload??{}) as Record<string,string>,field:memory.draft.payload?.field as string|undefined}]
 // Explicit confirmation/cancellation/selection are not interpreted by a probabilistic model.
 if(containsAssistantSecret(message)||/^(?:batal|ya|iya|konfirmasi|simpan(?: sekarang)?|oke simpan|(?:(?:pilih|nomor|no\.?|yang)\s+)?[1-9]\d?|lanjut|berikutnya|selanjutnya|halaman berikutnya|tampilkan berikutnya)$/i.test(message.trim()))return requestLegacyAssistant(trusted,message,token,history)
 if(!modelConfigured())return requestLegacyAssistant(trusted,message,token,history)
 const {data:catalog,error:catalogError}=await store.rpc('wa_operation_catalog')
 if(catalogError)throw new Error('Tool registry unavailable')
 const {data:retrieved,error:retrievalError}=await store.rpc('atm_agent_candidates',{p_actor:turn.actor,p_query:''})
 if(retrievalError)throw new Error('Scoped retrieval unavailable')
 const candidates=(retrieved??[]) as Candidate[]
 let plan:Plan
 try{
  const result=await modelPlan(message,turn.level,catalog as Record<string,Operation>,memory,candidates)
  Object.assign(trusted.agent!,{model:result.model,input:result.usage.input,output:result.usage.output})
  // Batch writes require a dedicated atomic preview; never execute just the first instruction silently.
  if(result.plan.steps.length>1){
   const steps=result.plan.steps.map(p=>groundCreation(p,[...(memory.recent??[]).filter(x=>x.role==='user').map(x=>x.text),...(history??[]),message]))
   if(steps.some(p=>!['read','propose'].includes(p.kind)))return dispatch(trusted,'reply',{message:steps.find(p=>p.kind==='clarify')?.question??'Ada bagian permintaan yang perlu diperjelas sebelum diproses. Belum ada perubahan.'})
   for(const p of steps)if(p.kind==='propose'&&(catalog as Record<string,Operation>)[p.operation??'']?.task){
    if(p.target&&/^[a-f0-9-]{36}$/i.test(p.target)&&!message.includes(p.target)&&!(p.context&&p.target===memory.activeTask))return dispatch(trusted,'reply',{message:'Sebutkan judul/PIC tugas agar setiap perubahan dapat diverifikasi.'})
    const found=resolveTask(p,candidates,memory);if(found.candidate)Object.assign(p,{target:found.candidate.id,pic:found.candidate.pic,exact:found.confidence===1,context:false})
   }
   return dispatch(trusted,'batch',{steps})
  }
  plan=result.plan.steps[0]
 }catch(error){
  console.warn('[agent] provider unavailable',{name:error instanceof Error?error.name:'Unknown'})
  // Same trusted executor and receipt; no paid-provider fallback and no invented success.
  return requestLegacyAssistant(trusted,message,token,history)
 }
 if(plan.kind==='propose'&&(catalog as Record<string,Operation>)[plan.operation??'']?.task){
  if(plan.target&&/^[a-f0-9-]{36}$/i.test(plan.target)&&!message.includes(plan.target)&&!(plan.context&&plan.target===memory.activeTask))return dispatch(trusted,'reply',{message:'Sebutkan judul atau PIC tugas yang ingin diubah agar objeknya dapat diverifikasi.'})
  const found=resolveTask(plan,candidates,memory)
  if(found.candidate){plan={...plan,target:found.candidate.id,pic:found.candidate.pic,exact:found.confidence===1,context:false}}
  else if(plan.context&&!memory.activeTask)return dispatch(trusted,'reply',{message:'Tugas yang mana? Sebutkan judul atau PIC-nya agar saya tidak salah mengubah.'})
  // Unmatched/ambiguous references remain for the backend's scoped disambiguation.
 }
 plan=groundCreation(plan,[...(memory.recent??[]).filter(x=>x.role==='user').map(x=>x.text),...(history??[]),message])
 return requestLegacyAssistant(trusted,message,token,history,plan)
}
