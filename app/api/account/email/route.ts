import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { EmailChangeError, parseEmailChange, requestMyEmailChange } from '@/lib/account/email-change'

export async function POST(request: NextRequest) {
  const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
  if (request.headers.get('origin') !== request.nextUrl.origin) return json({ message: 'Permintaan tidak diizinkan.' }, 403)
  if (!request.headers.get('content-type')?.includes('application/json')) return json({ message: 'Format permintaan tidak valid.' }, 400)
  try {
    const text = await request.text()
    if (text.length > 1024) return json({ message: 'Permintaan terlalu besar.' }, 413)
    let body: unknown
    try { body = JSON.parse(text) } catch { return json({ message: 'Format permintaan tidak valid.' }, 400) }
    const email = parseEmailChange(body)
    if (!email) return json({ message: 'Alamat email tidak valid.' }, 400)
    return json(await requestMyEmailChange(await createClient(), email, request.nextUrl.origin))
  } catch (error) {
    return error instanceof EmailChangeError
      ? json({ message: error.message }, error.status)
      : json({ message: 'Layanan perubahan email belum dapat dihubungi. Coba lagi nanti.' }, 503)
  }
}
