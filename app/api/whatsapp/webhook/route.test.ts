import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, POST } from './route'
import { readWebhookBody, verifyWhatsAppSignature } from '@/lib/whatsapp/security'

const url = 'https://example.test/api/whatsapp/webhook'
const secret = 'test-meta-app-secret'
function signedRequest(body: string) {
  return new Request(url, { method: 'POST', body, headers: {
    'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`,
  } })
}

describe('WhatsApp ingress security', () => {
  beforeEach(() => {
    vi.stubEnv('WHATSAPP_VERIFY_TOKEN', 'test-verification-token')
    vi.stubEnv('WHATSAPP_APP_SECRET', secret)
  })
  afterEach(() => vi.unstubAllEnvs())

  it('returns the exact challenge only for a valid handshake', async () => {
    const response = await GET(new Request(`${url}?hub.mode=subscribe&hub.verify_token=test-verification-token&hub.challenge=123456`))
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('123456')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
  it.each([
    'hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123',
    'hub.mode=unsubscribe&hub.verify_token=test-verification-token&hub.challenge=123',
    'hub.mode=subscribe&hub.verify_token=test-verification-token',
    'hub.mode=subscribe&hub.verify_token=test-verification-token&hub.challenge=<script>',
  ])('rejects invalid verification parameters: %s', async query => {
    expect((await GET(new Request(`${url}?${query}`))).status).toBe(403)
  })
  it('fails closed without configuration', async () => {
    vi.stubEnv('WHATSAPP_VERIFY_TOKEN', '')
    vi.stubEnv('WHATSAPP_APP_SECRET', '')
    expect((await GET(new Request(url))).status).toBe(503)
    expect((await POST(signedRequest('{}'))).status).toBe(503)
  })
  it('rejects unsigned and modified requests', async () => {
    expect((await POST(new Request(url, { method: 'POST', body: '{}' }))).status).toBe(401)
    const body = Buffer.from('{"object":"whatsapp_business_account"}')
    expect(verifyWhatsAppSignature(body, 'sha256=bad', secret)).toBe(false)
    const sig = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
    expect(verifyWhatsAppSignature(body, sig, secret)).toBe(true)
    expect(verifyWhatsAppSignature(Buffer.from('{}'), sig, secret)).toBe(false)
  })
  it('rejects signed malformed JSON and wrong event objects', async () => {
    expect((await POST(signedRequest('{'))).status).toBe(400)
    expect((await POST(signedRequest('{"object":"page"}'))).status).toBe(400)
  })
  it('does not falsely ACK messages before durable processing is ready', async () => {
    const response = await POST(signedRequest('{"object":"whatsapp_business_account","entry":[]}'))
    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('300')
  })
  it('bounds streamed bodies even without a content-length header', async () => {
    await expect(readWebhookBody(new Request(url, { method: 'POST', body: '123456' }), 5)).rejects.toThrow('payload_too_large')
    expect(Buffer.from(await readWebhookBody(new Request(url, { method: 'POST', body: '123' }), 5)).toString()).toBe('123')
  })
})
