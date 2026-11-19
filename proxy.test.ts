import { describe, expect, it, vi } from 'vitest'
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { NextRequest } from 'next/server'
import { config, proxy } from './proxy'
vi.mock('@/lib/supabase/middleware',()=>({updateSession:vi.fn(()=>{throw new Error('Cookie session must not be used by worker')})}))

describe('PWA public assets', () => {
  it.each(['/manifest.webmanifest', '/sw.js'])(
    'serves %s without requiring a session', (url) => {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false)
    },
  )
  it.each(['/tasks', '/dashboard', '/api/push/subscription', '/sw.js/private', '/manifest.webmanifest/private'])(
    'keeps session checks on %s', (url) => {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true)
    },
  )
})

it('lets the evaluation worker reach its own bearer authentication without a cookie redirect',async()=>{
 const response=await proxy(new NextRequest('https://preview.invalid/api/cron/agent-evaluation',{method:'POST'}))
 expect(response.headers.get('location')).toBeNull()
 expect(response.status).toBe(200)
})
