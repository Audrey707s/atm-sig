import { equalSecret, readWebhookBody, verifyWhatsAppSignature } from '@/lib/whatsapp/security'

const headers = { 'Cache-Control': 'no-store' }

// Meta's verification handshake is deliberately independent of browser cookies.
export async function GET(request: Request) {
  const token = process.env.WHATSAPP_VERIFY_TOKEN
  if (!token) return new Response('Webhook not configured', { status: 503, headers })
  const params = new URL(request.url).searchParams
  const challenge = params.get('hub.challenge')
  if (params.get('hub.mode') !== 'subscribe' ||
      !equalSecret(params.get('hub.verify_token') ?? '', token) ||
      !challenge || !/^\d{1,128}$/.test(challenge)) {
    return new Response('Forbidden', { status: 403, headers })
  }
  return new Response(challenge, { headers: { ...headers, 'Content-Type': 'text/plain' } })
}

export async function POST(request: Request) {
  const secret = process.env.WHATSAPP_APP_SECRET
  if (!secret) return new Response('Webhook not configured', { status: 503, headers })
  let body: Uint8Array
  try {
    body = await readWebhookBody(request)
  } catch {
    return new Response('Invalid payload size', { status: 413, headers })
  }
  if (!verifyWhatsAppSignature(body, request.headers.get('x-hub-signature-256'), secret)) {
    return new Response('Unauthorized', { status: 401, headers })
  }
  try {
    const payload: unknown = JSON.parse(new TextDecoder().decode(body))
    if (!payload || typeof payload !== 'object' ||
        !('object' in payload) || payload.object !== 'whatsapp_business_account') {
      return new Response('Invalid payload', { status: 400, headers })
    }
  } catch {
    return new Response('Invalid JSON', { status: 400, headers })
  }
  // Do not ACK and discard real messages before the durable inbox, account
  // linking and authorized command processor are deployed. Meta can retry.
  // No tokens, message bodies, phone numbers or signatures are logged.
  return new Response('Message processing not enabled', {
    status: 503,
    headers: { ...headers, 'Retry-After': '300' },
  })
}
