import { equalSecret } from '@/lib/whatsapp/security'
import { FonnteError, requireFreeFonnteDevice, sendFonnteText } from '@/lib/whatsapp/fonnte'

// Manual, authenticated self-test only; not a scheduler or arbitrary-send API.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET ?? ''
  const bearer = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
  if (!equalSecret(bearer, secret)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const recipient = process.env.FONNTE_TEST_RECIPIENT
  if (!recipient) return Response.json({ error: 'Test recipient not configured' }, { status: 503 })
  try {
    await requireFreeFonnteDevice()
    const result = await sendFonnteText(recipient, 'ATM-SIG: pesan uji koneksi WhatsApp berhasil diajukan dari server ATM. Ini hanya tes pengiriman; fitur pembaruan tugas lewat chat belum aktif.')
    return Response.json({ ...result, delivery: 'pending' }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return Response.json({ error: error instanceof FonnteError ? error.code : 'test_failed' }, { status: 502 })
  }
}
