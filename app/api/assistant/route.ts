import { createClient } from '@/lib/supabase/server'
import { requestAssistant } from '@/lib/ai/service'
import { readWebhookBody } from '@/lib/whatsapp/security'
const headers={'Cache-Control':'no-store'}
export async function POST(request:Request) {
 // Same-origin only; auth cookies must never turn a cross-site request into an action.
 if(request.headers.get('origin')!==new URL(request.url).origin) return new Response('Forbidden',{status:403,headers})
 const supabase=await createClient()
 const {data:{user},error}=await supabase.auth.getUser()
 if(error||!user) return new Response('Unauthorized',{status:401,headers})
 const {data:profile}=await supabase.from('users').select('status,role:roles!users_role_id_fkey(level)').eq('id',user.id).single()
 if(!profile||profile.status!=='aktif') return new Response('Forbidden',{status:403,headers})
 let input:{message?:unknown;token?:unknown}
 try {input=JSON.parse(new TextDecoder().decode(await readWebhookBody(request,14000)))}catch{return new Response('Invalid request',{status:400,headers})}
 if(!input||typeof input!=='object'||Array.isArray(input))return new Response('Invalid request',{status:400,headers})
 if(typeof input.message!=='string'||!input.message.trim()||input.message.length>3000||input.token!==undefined&&(typeof input.token!=='string'||input.token.length>50)) return new Response('Invalid request',{status:400,headers})
 if(process.env.ATM_AI_ENABLED!=='true') return Response.json({ok:false,message:'Asisten belum diaktifkan. Gunakan menu ATM untuk sementara.'},{headers})
 try {
  const result=await requestAssistant({actor:user.id,level:profile.role.level,channel:'web'},input.message,typeof input.token==='string'?input.token:undefined)
  return Response.json(result,{headers})
 }catch{return Response.json({ok:false,message:'Asisten sementara tidak tersedia. Periksa data di halaman terkait sebelum mengulangi perubahan.'},{status:503,headers})}
}
