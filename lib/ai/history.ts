import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { ChatThread,ChatEntry } from './history-contracts'
import type { AssistantReply } from './contracts'
type Table<R,I,U=Partial<I>>={Row:R;Insert:I;Update:U;Relationships:[]}
type HistoryDatabase={public:Omit<Database['public'],'Tables'>&{Tables:Database['public']['Tables']&{
 ai_chat_threads:Table<ChatThread&{user_id:string},{id?:string;user_id:string;title?:string;last_preview?:string;updated_at?:string;created_at?:string}>
 ai_chat_messages:Table<ChatEntry&{user_id:string;conversation_id:string},{id?:string;user_id:string;conversation_id:string;author:'user'|'assistant';content:string;page_path?:string|null;created_at?:string}>
}}}
// The same cookie-authenticated client and RLS; this adds only the new schema types.
export function historyClient(client:SupabaseClient<Database>){return client as unknown as SupabaseClient<HistoryDatabase>}
export function safeChatPath(path?:string|null){return path&&/^\/(?!\/)[a-z0-9/_?=&%-]*$/i.test(path)?path:null}
export async function beginChatTurn(client:SupabaseClient<Database>,userId:string,conversationId:string,message:string){
 const db=historyClient(client)
 const {data:thread,error}=await db.from('ai_chat_threads').select('id,title').eq('id',conversationId).eq('user_id',userId).maybeSingle()
 if(error)throw new Error('History unavailable')
 if(!thread)return null
 const {data:previous,error:readError}=await db.from('ai_chat_messages').select('content').eq('conversation_id',conversationId).eq('user_id',userId).eq('author','user').order('created_at',{ascending:false}).limit(3)
 if(readError)throw new Error('History unavailable')
 const {error:writeError}=await db.from('ai_chat_messages').insert({conversation_id:conversationId,user_id:userId,author:'user',content:message})
 if(writeError)throw new Error('History unavailable')
 const title=thread.title==='Percakapan baru'?message.replace(/\s+/g,' ').slice(0,100):thread.title
 const {error:updateError}=await db.from('ai_chat_threads').update({title,last_preview:message.slice(0,160),updated_at:new Date().toISOString()}).eq('id',conversationId).eq('user_id',userId)
 if(updateError)throw new Error('History unavailable')
 return [...(previous??[]).reverse().map(x=>x.content),message]
}
export async function finishChatTurn(client:SupabaseClient<Database>,userId:string,conversationId:string,reply:AssistantReply){
 const db=historyClient(client)
 // Archive text + checking path only. Never save actionable tokens or private row snapshots.
 let archive=reply.message
 if(Array.isArray(reply.rows))archive+='\n\n'+reply.rows.length+' hasil ditampilkan. Buka halaman terkait untuk data terbaru.'
 else if(reply.rows)archive+='\n\n'+Object.entries(reply.rows).map(([key,value])=>( {total:'Total',done:'Selesai',review:'Review',overdue:'Lewat tenggat'} as Record<string,string>)[key]+': '+String(value)).join(' · ')
 const {error}=await db.from('ai_chat_messages').insert({conversation_id:conversationId,user_id:userId,author:'assistant',content:archive.slice(0,12000),page_path:safeChatPath(reply.path)})
 if(error)throw new Error('History unavailable')
 const {error:updateError}=await db.from('ai_chat_threads').update({last_preview:reply.message.slice(0,160),updated_at:new Date().toISOString()}).eq('id',conversationId).eq('user_id',userId)
 if(updateError)throw new Error('History unavailable')
}
