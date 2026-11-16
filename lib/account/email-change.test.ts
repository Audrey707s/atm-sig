import {beforeEach,describe,it,expect,vi} from 'vitest'
import {NextRequest} from 'next/server'
const {getUser,updateUser,maybeSingle,eq}=vi.hoisted(()=>({getUser:vi.fn(),updateUser:vi.fn(),maybeSingle:vi.fn(),eq:vi.fn()}))
const client={auth:{getUser,updateUser},from:()=>({select:()=>({eq})})}
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>client}))
import {POST} from '@/app/api/account/email/route'
function request(body:unknown,origin='https://atm.test') {return new NextRequest('https://atm.test/api/account/email',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)})}
describe('verified self-service email changes',()=>{
  beforeEach(()=>{vi.clearAllMocks();getUser.mockResolvedValue({data:{user:{id:'actual-user',email:'old@example.com'}},error:null});eq.mockReturnValue({maybeSingle});maybeSingle.mockResolvedValue({data:{status:'aktif'},error:null});updateUser.mockResolvedValue({data:{user:{email:'old@example.com',new_email:'new@example.com'}},error:null})})
  it('derives the account from auth and asks Auth to verify the normalized address',async()=>{
    const response=await POST(request({email:' New@Example.com '}))
    expect(response.status).toBe(200);expect(eq).toHaveBeenCalledWith('id','actual-user')
    expect(updateUser).toHaveBeenCalledWith({email:'new@example.com'},{emailRedirectTo:'https://atm.test/auth/email-change'})
    expect((await response.json()).pendingEmail).toBe('new@example.com')
  })
  it('rejects another origin before reading auth',async()=>{expect((await POST(request({email:'new@example.com'},'https://evil.test'))).status).toBe(403);expect(getUser).not.toHaveBeenCalled()})
  it.each([{email:'bad'},{email:'new@example.com',userId:'victim'},{email:'new@example.com',role:'Super Admin'},['new@example.com'],null])('rejects invalid or injected fields %j',async body=>{expect((await POST(request(body))).status).toBe(400);expect(updateUser).not.toHaveBeenCalled()})
  it('rejects missing sessions and inactive profiles',async()=>{
    getUser.mockResolvedValueOnce({data:{user:null},error:null});expect((await POST(request({email:'new@example.com'}))).status).toBe(401)
    maybeSingle.mockResolvedValueOnce({data:{status:'nonaktif'},error:null});expect((await POST(request({email:'new@example.com'}))).status).toBe(403)
    expect(updateUser).not.toHaveBeenCalled()
  })
  it('rejects the current email without starting verification',async()=>{expect((await POST(request({email:'OLD@example.com'}))).status).toBe(400);expect(updateUser).not.toHaveBeenCalled()})
  it('handles rate limits, provider errors and malformed JSON without leaking internals',async()=>{
    updateUser.mockResolvedValueOnce({data:{user:null},error:{status:429,message:'secret'}});expect((await POST(request({email:'new@example.com'}))).status).toBe(429)
    updateUser.mockRejectedValueOnce(new Error('secret'));const response=await POST(request({email:'new@example.com'}));expect(response.status).toBe(503);expect(await response.text()).not.toContain('secret')
    expect((await POST(new NextRequest('https://atm.test/api/account/email',{method:'POST',headers:{origin:'https://atm.test','content-type':'application/json'},body:'{'}))).status).toBe(400)
  })
})
