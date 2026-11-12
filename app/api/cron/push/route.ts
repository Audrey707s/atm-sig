import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { deliverPendingPush } from '@/lib/push/server'
import { deliverPendingWhatsApp } from '@/lib/whatsapp/delivery'

async function processPushCron(request: Request) {
  const secret = process.env.CRON_SECRET
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
  if (!secret || Buffer.byteLength(token) !== Buffer.byteLength(secret) ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(secret))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const push = await deliverPendingPush()
    const whatsapp = await deliverPendingWhatsApp().catch(() => ({ deferred: true }))
    return NextResponse.json({ ...push, whatsapp })
  } catch (error) {
    console.error('Push delivery failed', error)
    return NextResponse.json({ error: 'Push delivery failed' }, { status: 500 })
  }
}

// Vercel Cron invokes GET; authenticated manual jobs may use POST.
export const GET = processPushCron
export const POST = processPushCron
