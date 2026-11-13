'use server'
import { createHash,randomBytes } from 'node:crypto'
import { getSessionUser } from '@/lib/auth/session'
import { channelStore,whatsappEnabled } from './store'
import { revalidatePath } from 'next/cache'

export async function getMyWhatsApp() {
  const user=await getSessionUser()
  if(!whatsappEnabled()) return {enabled:false,phone:null,notifications:false}
  const {data,error}=await channelStore().from('whatsapp_links').select('phone,notifications_enabled').eq('user_id',user.id).maybeSingle()
  if(error) throw new Error('Koneksi WhatsApp belum dapat dimuat.')
  return {enabled:true,phone:data?.phone??null,notifications:data?.notifications_enabled??false}
}
export async function beginWhatsAppLink() {
  const user=await getSessionUser()
  if(!whatsappEnabled()) return {error:'WhatsApp belum tersedia.'}
  const db=channelStore()
  const {data:existing,error:readError}=await db.from('whatsapp_links').select('phone,created_at').eq('user_id',user.id).maybeSingle()
  if(readError) return {error:'Koneksi WhatsApp belum dapat diperiksa.'}
  if(existing?.phone) return {error:'Putuskan koneksi lama terlebih dahulu.'}
  const code=randomBytes(18).toString('hex')
  const expires=new Date(Date.now()+10*60_000).toISOString()
  const values={code_hash:createHash('sha256').update(code).digest('hex'),code_expires_at:expires,notifications_enabled:false}
  const {data:saved,error}=existing
    ? await db.from('whatsapp_links').update(values).eq('user_id',user.id).is('phone',null).select('user_id').maybeSingle()
    : await db.from('whatsapp_links').insert({user_id:user.id,...values}).select('user_id').maybeSingle()
  if(error||!saved) return {error:'Kode belum dapat dibuat.'}
  return {code,expires,bot:process.env.WHATSAPP_CONNECT_NUMBER??process.env.FONNTE_BOT_NUMBER??''}
}
export async function disconnectWhatsApp() {
  const user=await getSessionUser()
  const db=channelStore()
  const {error}=await db.from('whatsapp_links').delete().eq('user_id',user.id)
  if(error) return {error:'Koneksi belum dapat diputuskan.'}
  await db.from('whatsapp_outbox').update({state:'cancelled'}).eq('user_id',user.id).eq('state','pending')
  revalidatePath('/account')
  return {success:true}
}
export async function setWhatsAppNotifications(enabled:boolean) {
  const user=await getSessionUser()
  if(typeof enabled!=='boolean') return {error:'Pilihan tidak valid.'}
  const {data,error}=await channelStore().from('whatsapp_links').update({notifications_enabled:enabled}).eq('user_id',user.id).not('phone','is',null).select('user_id').maybeSingle()
  if(error||!data) return {error:'Hubungkan WhatsApp terlebih dahulu.'}
  revalidatePath('/account')
  return {success:true}
}
