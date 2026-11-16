import {beforeEach,describe,it,expect,vi} from 'vitest'
import {NextRequest} from 'next/server'
const {exchangeCodeForSession,verifyOtp}=vi.hoisted(()=>({exchangeCodeForSession:vi.fn(),verifyOtp:vi.fn()}))
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{exchangeCodeForSession,verifyOtp}})}))
import {GET} from './route'
describe('email change callback',()=>{
  beforeEach(()=>{vi.clearAllMocks();exchangeCodeForSession.mockResolvedValue({error:null});verifyOtp.mockResolvedValue({error:null})})
  it('exchanges PKCE codes without accepting arbitrary redirect targets',async()=>{
    const response=await GET(new NextRequest('https://atm.test/auth/email-change?code=code&next=https://evil.test'))
    expect(exchangeCodeForSession).toHaveBeenCalledWith('code');expect(response.headers.get('location')).toBe('https://atm.test/account?email=confirmed');expect(response.headers.get('referrer-policy')).toBe('no-referrer');expect(response.headers.get('cache-control')).toBe('no-store')
  })
  it('accepts email_change tokens only',async()=>{
    await GET(new NextRequest('https://atm.test/auth/email-change?token_hash=hash&type=email_change'))
    expect(verifyOtp).toHaveBeenCalledWith({token_hash:'hash',type:'email_change'})
    verifyOtp.mockClear();await GET(new NextRequest('https://atm.test/auth/email-change?token_hash=hash&type=recovery'));expect(verifyOtp).not.toHaveBeenCalled()
  })
  it('handles partial confirmations and expired tokens without claiming the active address changed',async()=>{
    expect((await GET(new NextRequest('https://atm.test/auth/email-change'))).headers.get('location')).toContain('email=check')
    exchangeCodeForSession.mockResolvedValueOnce({error:{message:'expired'}})
    expect((await GET(new NextRequest('https://atm.test/auth/email-change?code=expired'))).headers.get('location')).toContain('email=failed')
  })
})
