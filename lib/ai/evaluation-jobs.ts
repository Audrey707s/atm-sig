import 'server-only'
import {assistantStore} from './service'
import {modelPlan} from './agent-model'
import {assessPlan,evaluationCandidates,type EvaluationCase} from './evaluation'
import fixtures from '@/docs/agent-v2/conversation-uat.json'
export function evaluationRevision(){
 const value=process.env.VERCEL_GIT_COMMIT_SHA
 if(!value||!/^[a-f0-9]{40}$/.test(value))throw new Error('Evaluation revision unavailable')
 return value
}
export async function evaluationState(actor:string,action:string,runId?:string){
 const {data,error}=await assistantStore().rpc('atm_eval_manage',{p_actor:actor,p_action:action,p_revision:evaluationRevision(),p_cases:fixtures.map(c=>c.id),p_run:runId??null}).abortSignal(AbortSignal.timeout(10000))
 if(error)throw new Error('Evaluation state unavailable')
 return data
}
export async function processEvaluationQueue(){
 const store=assistantStore(),revision=evaluationRevision(),started=Date.now();let processed=0
 const {data:catalog,error:catalogError}=await store.rpc('wa_operation_catalog').abortSignal(AbortSignal.timeout(10000))
 if(catalogError)throw new Error('Evaluation catalog unavailable')
 while(processed<2&&Date.now()-started<10000){
  const {data:claim,error}=await store.rpc('atm_eval_claim',{p_revision:revision}).abortSignal(AbortSignal.timeout(10000))
  if(error){console.error('[agent-evaluation-worker] claim database failure',{code:error.code,message:error.message?.slice(0,200)});throw new Error('Evaluation claim unavailable')}
  if(!claim)break
  const test=fixtures.find(c=>c.id===claim.caseId) as EvaluationCase|undefined
  let result:Record<string,unknown>,retry=false,delay=60
  try{
   if(!test)throw new Error('Unknown fixed fixture')
   const planned=await modelPlan(test.messages.join('\n'),test.role,catalog,test.memory,evaluationCandidates)
   result={...assessPlan(test,planned.plan,catalog),actual:planned.plan,model:planned.model,usage:planned.usage,role:test.role,category:test.category}
  }catch(error){
   const fault=error as {statusCode?:number;responseHeaders?:Record<string,string>;name?:string;message?:string}
   const invalid=(fault.name==='Error'&&/^(Invalid|Operation denied|Read denied|Conflicting|Unknown fixed fixture)/.test(fault.message??''))||['AI_InvalidToolInputError','AI_NoSuchToolError','AI_ToolCallRepairError'].includes(fault.name??'')
   const configuration=[401,403,404].includes(fault.statusCode??0)
   retry=!invalid&&!configuration
   const seconds=Number(fault.responseHeaders?.['retry-after'])
   delay=Number.isFinite(seconds)&&seconds>0?Math.min(3600,Math.ceil(seconds)):Math.min(900,60*2**Math.max(0,claim.attempt-1))
   result={status:configuration?'ERROR':invalid?'FAIL':'RETRY',reason:configuration?'Konfigurasi layanan model perlu diperiksa sebelum evaluasi dapat dilanjutkan.':invalid?'Rencana model gagal validasi skema atau izin.':fault.statusCode===429?'Kuota gratis membatasi permintaan. Percobaan ulang dijadwalkan.':'Layanan atau permintaan terputus. Percobaan ulang dijadwalkan.',...(invalid?{validationCode:/^(Invalid (?:action count|plan|kind|value|read|context|exact match|page|task|requested field|data|field)|Operation denied|Read denied|Conflicting owners|Unknown fixed fixture)$/.test(fault.message??'')?fault.message:fault.name}:{}),errorKind:configuration?'configuration':fault.statusCode===429?'quota':fault.name==='AbortError'||fault.name==='TimeoutError'?'timeout':invalid?'validation':'provider'}
   console.warn('[agent-evaluation-worker] attempt unavailable',{status:fault.statusCode,name:fault.name,caseId:claim.caseId})
  }
  const {data:saved,error:saveError}=await store.rpc('atm_eval_finish',{p_run:claim.run,p_case:claim.caseId,p_lease:claim.lease,p_result:result,p_retry:retry,p_delay:delay}).abortSignal(AbortSignal.timeout(10000))
  if(saveError)throw new Error('Evaluation result persistence unavailable')
  if(saved)processed++
  if(retry||!saved)break
 }
 return {processed,revision}
}
