
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// NFR-001 — Refresh session Supabase
export async function proxy(request: NextRequest) {
  // Machine-to-machine routes verify CRON_SECRET or Meta signatures themselves. Cookie-based session redirects would turn POST into
  // /login and prevent the queue from ever being processed.
  if (request.nextUrl.pathname === '/api/cron/push' ||
      request.nextUrl.pathname === '/api/cron/reminders' ||
      request.nextUrl.pathname === '/api/whatsapp/webhook' ||
      request.nextUrl.pathname === '/api/whatsapp/test') {
    const { NextResponse } = await import('next/server')
    return NextResponse.next()
  }
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest$|sw\\.js$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
