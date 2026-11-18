import {readWebhookBody} from '@/lib/whatsapp/security'
import {createClient} from '@/lib/supabase/server'
import {assistantStore} from '@/lib/ai/service'
import {modelConfigured,modelPlan} from '@/lib/ai/agent-model'
import {assessPlan,evaluationCandidates,type EvaluationCase} from '@/lib/ai/evaluation'
import cases from '@/docs/agent-v2/conversation-uat.json'
import type {Operation} from '@/lib/ai/contracts'
const headers={'Cache-Control':'no-store'}
export async function POST(request:Request){
 if(process.env.VERCEL_ENV!=='preview'||process.env.ATM_AGENT_V2!=='on')return new Response('Not found',{status:404,headers})
 if(request.headers.get('origin')!==new URL(request.url).origin)return new Response('Forbidden',{status:403,headers})
 const db=await createClient(),{data:{user}}=await db.auth.getUser()
 if(!user)return new Response('Unauthorized',{status:401,headers})
 const {data:profile}=await db.from('users').select('status,role:roles!users_role_id_fkey(level)').eq('id',user.id).single()
 if(profile?.status!=='aktif'||!profile.role||profile.role.level<5)return new Response('Forbidden',{status:403,headers})
 let id:unknown
 try{if(Number(request.headers.get('content-length')??0)>200)return new Response('Invalid request',{status:400,headers});id=JSON.parse(new TextDecoder().decode(await readWebhookBody(request,200))).caseId}catch{return new Response('Invalid request',{status:400,headers})}
 const test=cases.find(c=>c.id===id) as EvaluationCase|undefined
 if(!test)return new Response('Unknown fixture',{status:400,headers})
 if(!modelConfigured())return Response.json({status:'BLOCKED',reason:'Free provider is not configured.'},{status:503,headers})
 const store=assistantStore()
 const {count,error:rateError}=await store.from('atm_agent_traces').select('id',{count:'exact',head:true}).eq('user_id',user.id).like('operation','agent_evaluation:%').gte('created_at',new Date(Date.now()-60000).toISOString())
 if(rateError)return new Response('Unavailable',{status:503,headers})
 if((count??0)>=2)return Response.json({status:'BLOCKED',reason:'Evaluation pacing limit.'},{status:429,headers:{...headers,'Retry-After':'60'}})
 const {data:catalog,error}=await store.rpc('wa_operation_catalog')
 if(error)return new Response('Unavailable',{status:503,headers})
 const started=Date.now()
 try{
  // Fixed synthetic fixtures only. This route never calls a business action executor.
  const result=await modelPlan(test.messages.join('\n'),test.role,catalog,test.memory,evaluationCandidates)
  const assessment=assessPlan(test,result.plan,catalog as Record<string,Operation>)
  const {error:traceError}=await store.from('atm_agent_traces').insert({user_id:user.id,channel:'web',operation:'agent_evaluation:'+test.id,model:result.model,input_tokens:result.usage.input,output_tokens:result.usage.output,latency_ms:Date.now()-started,outcome:'evaluation_'+assessment.status.toLowerCase()})
  if(traceError)console.warn('[agent-evaluation] metadata unavailable')
  return Response.json({id:test.id,role:test.role,category:test.category,...assessment,actual:result.plan,model:result.model,usage:result.usage,latency:Date.now()-started},{headers})
 }catch(error){
  const status=typeof(error as {statusCode?:unknown}).statusCode==='number'?(error as {statusCode:number}).statusCode:undefined
  console.warn('[agent-evaluation] provider unavailable',{status,name:error instanceof Error?error.name:'Unknown'})
  if(error instanceof Error&&error.name==='Error'&&/^(Invalid|Operation denied|Read denied|Conflicting)/.test(error.message))return Response.json({id:test.id,status:'FAIL',reason:'Model plan failed schema or authorization validation.'},{headers})
  return Response.json({id:test.id,status:'BLOCKED',reason:status===429?'Free provider quota temporarily unavailable.':'Provider planning failed; no action was executed.'},{status:status===429?429:503,headers:{...headers,'Retry-After':'60'}})
 }
}
