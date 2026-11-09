import { describe, expect, it } from 'vitest'
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { config } from './proxy'

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
