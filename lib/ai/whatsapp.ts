import 'server-only'
import type { FonnteIncoming } from '@/lib/whatsapp/incoming'
import { assistantStore,requestAssistant } from './service'
/** Called only after the existing webhook secret/device/sender/timestamp checks. */
export async function receiveAssistantWhatsApp(incoming:FonnteIncoming):Promise<boolean> {
 if(process.env.ATM_AI_ENABLED!=='true'||!incoming.text) return false
 const store=assistantStore()
 const {data:link,error}=await store.from('whatsapp_links').select('user_id,linked_at,notifications_enabled').eq('phone',incoming.sender).maybeSingle()
 if(error) throw new Error('Assistant link lookup unavailable')
 if(!link?.linked_at||!link.notifications_enabled) return false
 const {data:receipt,error:receiptError}=await store.from('whatsapp_receipts').select('id').eq('id',incoming.id).maybeSingle()
 if(receiptError)throw new Error('Receipt lookup unavailable')
 if(receipt)return true
 const {data:profile}=await store.from('users').select('status,role:roles!users_role_id_fkey(level)').eq('id',link.user_id).single()
 if(!profile||profile.status!=='aktif') return false
 const role=profile.role as unknown as {level:number}
 const {data:pending}=await store.from('atm_ai_sessions').select('token,phone,linked_at,expires_at').eq('user_id',link.user_id).eq('channel','whatsapp').maybeSingle()
 const confirmation=/^(ya|konfirmasi|batal)$/i.test(incoming.text.trim())
 const validPending=Boolean(pending?.token&&pending.phone===incoming.sender&&pending.linked_at===link.linked_at&&Date.parse(pending.expires_at)>Date.now())
 if(confirmation&&!validPending) return false
 if(!confirmation) {
  // Preserve linking, STOP/MULAI/PUTUS, menu commands, numeric selections and native forms.
  if(incoming.command!=='help'||/^(menu|bantuan)$/i.test(incoming.text)||incoming.text.includes(':')) {
   const {error:resetError}=await store.from('atm_ai_sessions').delete().eq('user_id',link.user_id).eq('channel','whatsapp')
   if(resetError)throw new Error('Assistant reset unavailable')
   return false
  }
  const [{data:action},{data:chat}]=await Promise.all([
   store.from('whatsapp_action_sessions').select('state,expires_at').eq('user_id',link.user_id).maybeSingle(),
   store.from('whatsapp_chat_sessions').select('context,expires_at').eq('user_id',link.user_id).maybeSingle(),
  ])
  if((action&&Date.parse(action.expires_at)>Date.now()&&['form','confirm'].includes(action.state?.kind))||(chat&&Date.parse(chat.expires_at)>Date.now()&&['confirm','progress_value'].includes(chat.context?.kind))) return false
 }
 await requestAssistant({actor:link.user_id,level:role.level,channel:'whatsapp',phone:incoming.sender,receipt:incoming.id,linkedAt:link.linked_at},incoming.text)
 return true
}
