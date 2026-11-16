import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const code = params.get('code'), hash = params.get('token_hash')
  let status = 'check'
  try {
    if (params.has('error') || params.has('error_code')) status = 'failed'
    else if (code || (hash && params.get('type') === 'email_change')) {
      const client = await createClient()
      const result = code ? await client.auth.exchangeCodeForSession(code)
        : await client.auth.verifyOtp({ token_hash: hash!, type: 'email_change' })
      status = result.error ? 'failed' : 'confirmed'
    }
  } catch { status = 'failed' }
  const response = NextResponse.redirect(new URL(`/account?email=${status}`, request.url))
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}
