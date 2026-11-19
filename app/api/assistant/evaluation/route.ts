import {readWebhookBody} from '@/lib/whatsapp/security'
import {createClient} from '@/lib/supabase/server'
import {evaluationState} from '@/lib/ai/evaluation-jobs'
import {isValidUuid} from '@/lib/tasks/validation'
const headers={'Cache-Control':'no-store'}
async function identity(request:Request,write:boolean){
 if(process.env.VERCEL_ENV!=='preview'||process.env.ATM_AGENT_V2!=='on')return new Response('Not found',{status:404,headers})
 if(write&&request.headers.get('origin')!==new URL(request.url).origin)return new Response('Forbidden',{status:403,headers})
 const db=await createClient(),{data:{user}}=await db.auth.getUser()
 if(!user)return new Response('Unauthorized',{status:401,headers})
 const {data:profile}=await db.from('users').select('status,role:roles!users_role_id_fkey(level)').eq('id',user.id).single()
 if(profile?.status!=='aktif'||!profile.role||profile.role.level<5)return new Response('Forbidden',{status:403,headers})
 return user.id
}
export async function GET(request:Request){
 const actor=await identity(request,false);if(actor instanceof Response)return actor
 const runId=new URL(request.url).searchParams.get('runId')??undefined
 if(runId&&!isValidUuid(runId))return new Response('Invalid run',{status:400,headers})
 try{return Response.json(await evaluationState(actor,'status',runId),{headers})}catch{return Response.json({error:'Progres server belum dapat dimuat. Pekerja server tetap berjalan.'},{status:503,headers})}
}
export async function POST(request:Request){
 const actor=await identity(request,true);if(actor instanceof Response)return actor
 let body:{action?:unknown;runId?:unknown}
 try{body=JSON.parse(new TextDecoder().decode(await readWebhookBody(request,500)))}catch{return new Response('Invalid request',{status:400,headers})}
 if(!body||typeof body.action!=='string'||!['start','pause','resume','retry','new'].includes(String(body.action))||body.runId!==undefined&&(typeof body.runId!=='string'||!isValidUuid(body.runId)))return new Response('Invalid command',{status:400,headers})
 try{return Response.json(await evaluationState(actor,String(body.action),body.runId as string|undefined),{headers})}catch{return Response.json({error:'Perintah belum tersimpan. Muat ulang progres server sebelum mencoba kembali.'},{status:503,headers})}
}
