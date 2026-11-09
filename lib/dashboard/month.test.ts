import { describe, expect, it } from 'vitest'
import { resolveDashboardMonth } from './month'

describe('resolveDashboardMonth', () => {
  it('keeps a valid month selected by the user', () => {
    expect(resolveDashboardMonth('2026-10', new Date('2026-11-02T00:00:00Z'))).toBe('2026-10')
  })

  it('uses the Jakarta month across a year boundary', () => {
    expect(resolveDashboardMonth(undefined, new Date('2026-12-31T17:01:00Z'))).toBe('2027-01')
  })

  it('falls back to the current Jakarta month for invalid input', () => {
    expect(resolveDashboardMonth('2026-13', new Date('2026-11-02T00:00:00Z'))).toBe('2026-11')
  })
})
