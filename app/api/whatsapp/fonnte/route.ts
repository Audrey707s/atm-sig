import { after } from 'next/server'
import { equalSecret,readWebhookBody } from '@/lib/whatsapp/security'
import { parseFonnteIncoming } from '@/lib/whatsapp/incoming'
import { channelStore,whatsappEnabled } from '@/lib/whatsapp/store'
import { deliverPendingWhatsApp } from '@/lib/whatsapp/delivery'
const headers={'Cache-Control':'no-store'}
function authorized(request:Request) {
  return equalSecret(new URL(request.url).searchParams.get('key')??'',process.env.FONNTE_WEBHOOK_SECRET??'')
}
export async function GET(request:Request) {
  return new Response(null,{status:authorized(request)?204:401,headers})
}
export async function POST(request:Request) {
  if(!authorized(request)) return new Response('Unauthorized',{status:401,headers})
  if(!whatsappEnabled()) return new Response('Not enabled',{status:503,headers})
  let incoming
  try { incoming=parseFonnteIncoming(JSON.parse(new TextDecoder().decode(await readWebhookBody(request,32_768))),process.env.FONNTE_BOT_NUMBER??'') }
  catch { return new Response('Invalid payload',{status:400,headers}) }
  if(!incoming) return new Response(null,{status:204,headers})
  const {error}=await channelStore().rpc('wa_receive',{p_id:incoming.id,p_sender:incoming.sender,p_command:incoming.command,p_hash:incoming.codeHash})
  if(error) return new Response('Not accepted',{status:503,headers})
  // Only ACK after the receipt and reply are durably committed together.
  after(async()=>{try{await deliverPendingWhatsApp()}catch{/* durable pending rows remain for scheduler recovery */}})
  return Response.json({accepted:true},{headers})
}
