import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { channelStore,whatsappEnabled } from './store'
import { requireFreeFonnteDevice,sendFonnteText } from './fonnte'

export async function deliverPendingWhatsApp() {
  if(!whatsappEnabled()) return {enabled:false,accepted:0}
  const db=channelStore()
  const {error:enqueueError}=await db.rpc('wa_enqueue_notifications',{})
  if(enqueueError) return {enabled:true,accepted:0,deferred:true}
  const {data:pending,error:pendingError}=await db.from('whatsapp_outbox').select('id').eq('state','pending').limit(1)
  if(pendingError||!pending?.length) return {enabled:true,accepted:0}
  try { await requireFreeFonnteDevice() } catch { return {enabled:true,accepted:0,deferred:true} }
  let accepted=0
  for(let count=0;count<5;count++) {
    const {data,error}=await db.rpc('wa_claim_outbox',{})
    if(error||!data?.length) break
    const item=data[0]
    if(item.user_id) {
      const {data:link}=await db.from('whatsapp_links').select('phone,notifications_enabled').eq('user_id',item.user_id).maybeSingle()
      const {data:user}=await createAdminClient().from('users').select('status').eq('id',item.user_id).maybeSingle()
      if(!link?.notifications_enabled||link.phone!==item.phone||user?.status!=='aktif') {
        await db.from('whatsapp_outbox').update({state:'cancelled'}).eq('id',item.id)
        continue
      }
    }
    try {
      const result=await sendFonnteText(item.phone,item.body)
      await db.from('whatsapp_outbox').update({state:'accepted',provider_ids:result.messageIds,accepted_at:new Date().toISOString()}).eq('id',item.id)
      accepted++
    } catch {
      // A send can succeed remotely even if its HTTP response is lost.
      // Never blindly retry: retain this item for reconciliation instead.
      await db.from('whatsapp_outbox').update({state:'unknown'}).eq('id',item.id)
      break
    }
  }
  return {enabled:true,accepted}
}
