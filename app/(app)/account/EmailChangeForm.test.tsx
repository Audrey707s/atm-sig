// @vitest-environment jsdom
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react'
const {refresh}=vi.hoisted(()=>({refresh:vi.fn()}))
vi.mock('next/navigation',()=>({useRouter:()=>({refresh})}))
import EmailChangeForm from './EmailChangeForm'
describe('profile email verification UI',()=>{
  beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({pendingEmail:'new@example.com',message:'Permintaan terkirim.'})}))})
  afterEach(()=>{cleanup();vi.unstubAllGlobals()})
  it('submits only the new address and shows pending rather than changing the active login',async()=>{
    render(<EmailChangeForm/>);fireEvent.click(screen.getByText('Ubah email',{exact:true}))
    fireEvent.change(screen.getByLabelText('Email baru'),{target:{value:'new@example.com'}})
    fireEvent.submit(screen.getByRole('button',{name:'Kirim verifikasi'}).closest('form')!)
    await waitFor(()=>expect(screen.getByText('Menunggu verifikasi: new@example.com')).toBeTruthy())
    expect(fetch).toHaveBeenCalledWith('/api/account/email',expect.objectContaining({body:JSON.stringify({email:'new@example.com'})}))
    expect(refresh).toHaveBeenCalledOnce()
  })
  it('keeps an error visible and allows retry after failure',async()=>{
    vi.mocked(fetch).mockResolvedValueOnce({ok:false,json:async()=>({message:'Tunggu sebentar.'})} as Response)
    render(<EmailChangeForm pendingEmail="pending@example.com"/>);fireEvent.click(screen.getByText('Ubah email',{exact:true}))
    fireEvent.submit(screen.getByRole('button',{name:'Kirim verifikasi'}).closest('form')!)
    await waitFor(()=>expect(screen.getByRole('alert').textContent).toBe('Tunggu sebentar.'))
    expect(screen.getByRole('button',{name:'Kirim verifikasi'}).hasAttribute('disabled')).toBe(false)
    expect(screen.getByText('Menunggu verifikasi: pending@example.com')).toBeTruthy()
  })
})
