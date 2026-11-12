import 'server-only'

export class FonnteError extends Error {
  constructor(public readonly code: string) {
    super('Layanan WhatsApp belum dapat memproses permintaan.')
    this.name = 'FonnteError'
  }
}

async function requestFonnte(path: 'device' | 'send', body?: FormData): Promise<Record<string, unknown>> {
  const token = process.env.FONNTE_API_TOKEN
  if (!token || /\s/.test(token)) throw new FonnteError('not_configured')
  let response: Response
  try {
    response = await fetch(`https://api.fonnte.com/${path}`, {
      method: 'POST',
      headers: { Authorization: token },
      body,
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    // A timed-out send may already be queued. Never retry it automatically.
    throw new FonnteError('provider_unavailable')
  }
  if (!response.ok) throw new FonnteError('provider_http_error')
  let data: unknown
  try { data = await response.json() } catch { throw new FonnteError('invalid_response') }
  if (!data || typeof data !== 'object' || !('status' in data) || data.status !== true) {
    throw new FonnteError('provider_rejected')
  }
  return data as Record<string, unknown>
}

export async function requireFreeFonnteDevice(): Promise<void> {
  const profile = await requestFonnte('device')
  if (typeof profile.package !== 'string' || profile.package.toLowerCase() !== 'free') {
    throw new FonnteError('free_package_required')
  }
  if (profile.device_status !== 'connect') throw new FonnteError('device_disconnected')
  const quota = typeof profile.quota === 'number' ? profile.quota :
    typeof profile.quota === 'string' && /^\d+$/.test(profile.quota) ? Number(profile.quota) : NaN
  if (!Number.isSafeInteger(quota) || quota < 1) throw new FonnteError('quota_unavailable')
}

// Call only after recipient consent/authorization and a durable outbox claim.
// HTTP acceptance is a queued result, not proof of delivery or reading.
export async function sendFonnteText(target: string, message: string) {
  if (!/^[1-9]\d{7,14}$/.test(target) || !message.trim() || message.length > 4_000) {
    throw new FonnteError('invalid_message')
  }
  const body = new FormData()
  body.set('target', target)
  body.set('message', message)
  body.set('countryCode', '0')
  body.set('connectOnly', 'true')
  body.set('preview', 'false')
  const data = await requestFonnte('send', body)
  const ids = Array.isArray(data.id) ? data.id.filter((id): id is string => typeof id === 'string' && /^\d+$/.test(id)) : []
  if (!ids.length) throw new FonnteError('missing_message_id')
  return { accepted: true as const, messageIds: ids }
}
