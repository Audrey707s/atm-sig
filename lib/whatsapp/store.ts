import 'server-only'
import { createClient } from '@supabase/supabase-js'

type Link = { user_id:string; phone:string|null; code_hash:string|null; code_expires_at:string|null; linked_at:string|null; notifications_enabled:boolean; created_at:string }
type Receipt = { id:string; sender:string; received_at:string }
export type WhatsAppOutbox = { id:string; notification_id:string|null; receipt_id:string|null; user_id:string|null; phone:string; body:string; state:string; provider_ids:string[]|null; created_at:string; attempted_at:string|null; accepted_at:string|null }
type Table<T> = { Row:T; Insert:Partial<T>; Update:Partial<T>; Relationships:[] }
type ChannelDatabase = { public:{ Tables:{ whatsapp_links:Table<Link>; whatsapp_receipts:Table<Receipt>; whatsapp_outbox:Table<WhatsAppOutbox> }; Views:Record<string,never>; Enums:Record<string,never>; Functions:{ wa_receive_task:{Args:{p_id:string;p_sender:string;p_command:string;p_hash:string|null;p_args:Record<string,string|number>};Returns:string}; wa_receive:{Args:{p_id:string;p_sender:string;p_command:string;p_hash:string|null};Returns:string}; wa_link_phone:{Args:{p_hash:string;p_phone:string};Returns:string|null};wa_enqueue_notifications:{Args:Record<string,never>;Returns:number};wa_claim_outbox:{Args:Record<string,never>;Returns:WhatsAppOutbox[]} } } }
export function channelStore() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY
  if(!url||!key) throw new Error('WhatsApp storage unavailable')
  return createClient<ChannelDatabase>(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
}
export function whatsappEnabled() { return process.env.WHATSAPP_CHANNEL_ENABLED==='true' }
