import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { requireFreeFonnteDevice, sendFonnteText } from './fonnte'
import { POST } from '@/app/api/whatsapp/test/route'

const fetchMock = vi.fn()
const profile = { status: true, package: 'Free', device_status: 'connect', quota: '1000' }
describe('Fonnte free connection', () => {
  beforeEach(() => {
    vi.stubEnv('FONNTE_API_TOKEN', 'test-provider-token')
    vi.stubEnv('FONNTE_TEST_RECIPIENT', '6281234567890')
    vi.stubEnv('CRON_SECRET', 'test-cron-secret')
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
  it('checks the free package, connection and remaining quota', async () => {
    fetchMock.mockResolvedValue(Response.json(profile))
    await requireFreeFonnteDevice()
    expect(fetchMock).toHaveBeenCalledWith('https://api.fonnte.com/device', expect.objectContaining({ method: 'POST', redirect: 'error' }))
  })
  it.each([
    { ...profile, package: 'Reguler' },
    { ...profile, device_status: 'disconnect' },
    { ...profile, quota: '0' },
    { ...profile, quota: 'unknown' },
  ])('fails closed on an unsuitable device: %j', async data => {
    fetchMock.mockResolvedValue(Response.json(data))
    await expect(requireFreeFonnteDevice()).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('sends one text recipient without attachments or country rewriting', async () => {
    fetchMock.mockResolvedValue(Response.json({ status: true, id: ['1234'] }))
    expect(await sendFonnteText('6281234567890', 'Test ATM')).toEqual({ accepted: true, messageIds: ['1234'] })
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.fonnte.com/send')
    expect(options.headers.Authorization).toBe('test-provider-token')
    expect(options.body.get('countryCode')).toBe('0')
    expect(options.body.get('target')).toBe('6281234567890')
    expect(options.body.has('url')).toBe(false)
  })
  it.each([[[1234]], [1234], ['1234']])('normalizes numeric and scalar provider ids: %j', async id => {
    fetchMock.mockResolvedValue(Response.json({ status: true, id }))
    expect(await sendFonnteText('6281234567890', 'Test')).toEqual({ accepted: true, messageIds: ['1234'] })
  })
  it('rejects group/bulk targets and empty messages before sending', async () => {
    await expect(sendFonnteText('6281234567890,6281111111111', 'Test')).rejects.toThrow()
    await expect(sendFonnteText('12345@g.us', 'Test')).rejects.toThrow()
    await expect(sendFonnteText('6281234567890', '')).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('does not expose provider errors or retry ambiguous network failures', async () => {
    fetchMock.mockRejectedValue(new Error('secret-provider-details'))
    await expect(sendFonnteText('6281234567890', 'Test')).rejects.not.toThrow('secret-provider-details')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('rejects provider failures but preserves acceptance without tracking metadata', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ status: false, reason: 'invalid token' }))
      .mockResolvedValueOnce(Response.json({ status: true }))
    await expect(sendFonnteText('6281234567890', 'Test')).rejects.toThrow()
    expect(await sendFonnteText('6281234567890', 'Test')).toEqual({ accepted: true, messageIds: [] })
  })
  it('protects the self-test and ignores arbitrary request targets', async () => {
    expect((await POST(new Request('https://example.test/api/whatsapp/test', { method: 'POST' }))).status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
    fetchMock.mockResolvedValueOnce(Response.json(profile))
      .mockResolvedValueOnce(Response.json({ status: true, id: ['1234'] }))
    const response = await POST(new Request('https://example.test/api/whatsapp/test?target=6289999999999', { method: 'POST', headers: { Authorization: 'Bearer test-cron-secret' } }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ accepted: true, messageIds: ['1234'], delivery: 'pending' })
    expect(fetchMock.mock.calls[1][1].body.get('target')).toBe('6281234567890')
  })
  it('rejects missing API configuration without making a request', async () => {
    vi.stubEnv('FONNTE_API_TOKEN', '')
    await expect(requireFreeFonnteDevice()).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
