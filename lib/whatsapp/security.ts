import { createHmac, timingSafeEqual } from 'node:crypto'

export function equalSecret(actual: string, expected: string): boolean {
  const left = Buffer.from(actual)
  const right = Buffer.from(expected)
  return right.length > 0 && left.length === right.length && timingSafeEqual(left, right)
}

export function verifyWhatsAppSignature(body: Uint8Array, signature: string | null, secret: string): boolean {
  if (!secret || !signature || !/^sha256=[a-fA-F0-9]{64}$/.test(signature)) return false
  const expected = createHmac('sha256', secret).update(body).digest()
  const received = Buffer.from(signature.slice(7), 'hex')
  return timingSafeEqual(received, expected)
}

export async function readWebhookBody(request: Request, maxBytes = 1_048_576): Promise<Uint8Array> {
  const declaredLength = request.headers.get('content-length')
  if (declaredLength && Number(declaredLength) > maxBytes) throw new Error('payload_too_large')
  const reader = request.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel()
        throw new Error('payload_too_large')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks, size)
}
