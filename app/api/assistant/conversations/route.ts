import {createClient} from '@/lib/supabase/server'
import {historyClient} from '@/lib/ai/history'
import {isValidUuid} from '@/lib/tasks/validation'
const headers={'Cache-Control':'no-store'}
async function session(){
 const client=await createClient(),{data:{user},error}=await client.auth.getUser()
 if(error||!user)return null
 const {data:profile}=await client.from('users').select('status').eq('id',user.id).single()
 return profile?.status==='aktif'?{db:historyClient(client),userId:user.id}:null
}
export async function GET(request:Request){
 const auth=await session();if(!auth)return new Response('Unauthorized',{status:401,headers})
 const id=new URL(request.url).searchParams.get('id')
 if(id){
  if(!isValidUuid(id))return new Response('Invalid request',{status:400,headers})
  const {data:thread,error}=await auth.db.from('ai_chat_threads').select('id,title,last_preview,updated_at,created_at').eq('id',id).eq('user_id',auth.userId).maybeSingle()
  if(error)return new Response('History unavailable',{status:503,headers})
  if(!thread)return new Response('Not found',{status:404,headers})
  const {data:messages,error:messagesError}=await auth.db.from('ai_chat_messages').select('id,author,content,page_path,created_at').eq('conversation_id',id).eq('user_id',auth.userId).order('created_at',{ascending:false}).limit(100)
  if(messagesError)return new Response('History unavailable',{status:503,headers})
  return Response.json({thread,messages:(messages??[]).reverse()},{headers})
 }
 const {data,error}=await auth.db.from('ai_chat_threads').select('id,title,last_preview,updated_at,created_at').eq('user_id',auth.userId).neq('last_preview','').order('updated_at',{ascending:false}).limit(50)
 if(error)return new Response('History unavailable',{status:503,headers})
 return Response.json({threads:data??[]},{headers})
}
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return new Response('Forbidden',{status:403,headers})
 const auth=await session();if(!auth)return new Response('Unauthorized',{status:401,headers})
 const {data,error}=await auth.db.from('ai_chat_threads').insert({user_id:auth.userId}).select('id,title,last_preview,updated_at,created_at').single()
 if(error)return new Response('History unavailable',{status:503,headers})
 return Response.json({thread:data},{headers})
}
