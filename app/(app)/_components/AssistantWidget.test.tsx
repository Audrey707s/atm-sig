// @vitest-environment jsdom
import {beforeEach,describe,it,expect,vi} from 'vitest'
import {fireEvent,render,screen,waitFor,cleanup} from '@testing-library/react'
const {refresh,push}=vi.hoisted(()=>({refresh:vi.fn(),push:vi.fn()}))
vi.mock('next/navigation',()=>({useRouter:()=>({refresh,push})}))
vi.mock('next/link',()=>({default:({children,href,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>)=><a href={href} {...props}>{children}</a>}))
import AssistantWidget from './AssistantWidget'
describe('ATM assistant widget',()=>{
 beforeEach(()=>{cleanup();HTMLElement.prototype.scrollIntoView=vi.fn();vi.stubGlobal('fetch',vi.fn())})
 it('opens with a label and closes with Escape, restoring launcher focus',()=>{
  render(<AssistantWidget/>);fireEvent.click(screen.getByRole('button',{name:'Buka ATM Agent'}))
  expect(screen.getByRole('dialog',{name:'ATM Agent'})).toBeTruthy();fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'})
  expect(screen.queryByRole('dialog')).toBeNull();expect(document.activeElement).toBe(screen.getByRole('button',{name:'Buka ATM Agent'}))
 })
 it('displays a preview and sends its server-issued token only after confirmation',async()=>{
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({thread:{id:'12345678-1234-4234-8234-123456789abc'}})).mockResolvedValueOnce(Response.json({ok:true,message:'Pratinjau',pending:true,token:'server-token'})).mockResolvedValueOnce(Response.json({ok:true,message:'Berhasil',changed:true,path:'/tasks'}))
  render(<AssistantWidget/>);fireEvent.click(screen.getByRole('button',{name:'Buka ATM Agent'}))
  fireEvent.change(screen.getByLabelText('Pesan untuk asisten'),{target:{value:'buat tugas'}});fireEvent.click(screen.getByRole('button',{name:'Kirim'}))
  await screen.findByText('Pratinjau');expect(fetch).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button',{name:'Konfirmasi'}));await screen.findByText('Berhasil')
  expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]!.body as string)).toEqual({message:'YA',token:'server-token',conversationId:'12345678-1234-4234-8234-123456789abc'})
  expect(refresh).toHaveBeenCalled();expect(screen.getByRole('link',{name:/Buka halaman/}).getAttribute('href')).toBe('/tasks')
 })
 it('handles failed replies and renders model text without HTML execution',async()=>{
  vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'))
  render(<AssistantWidget/>);fireEvent.click(screen.getByRole('button',{name:'Buka ATM Agent'}))
  fireEvent.change(screen.getByLabelText('Pesan untuk asisten'),{target:{value:'<script>alert(1)</script>'}});fireEvent.click(screen.getByRole('button',{name:'Kirim'}))
  await waitFor(()=>expect(screen.getByText(/Pesan belum dapat diproses/)).toBeTruthy());expect(document.querySelector('script')).toBeNull()
 })
 it('shows role-filtered help articles with search and a working page link',async()=>{
  render(<AssistantWidget helpTopics={[{topic:'calendar',text:'Lihat tenggat pekerjaan Anda.',path:'/calendar'}]}/>)
  fireEvent.click(screen.getByRole('button',{name:'Buka ATM Agent'}));fireEvent.click(screen.getByRole('tab',{name:'Helpdesk'}))
  fireEvent.change(screen.getByRole('textbox',{name:'Cari panduan'}),{target:{value:'kalender'}})
  fireEvent.click(screen.getByRole('button',{name:'Kalender pekerjaan'}))
  expect(screen.getByText('Lihat tenggat pekerjaan Anda.')).toBeTruthy()
  expect(screen.getByRole('link',{name:/Buka halaman/}).getAttribute('href')).toBe('/calendar')
  expect(screen.queryByText('Pengelolaan pengguna')).toBeNull()
 })
 it('opens only the requested saved transcript without reviving confirmation actions',async()=>{
  const thread={id:'12345678-1234-4234-8234-123456789abc',title:'Tugas saya',last_preview:'Tugas pribadi',updated_at:'2026-11-13T16:00:00Z',created_at:'2026-11-13T16:00:00Z'}
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({threads:[thread]})).mockResolvedValueOnce(Response.json({thread,messages:[{id:'msg-1',author:'assistant',content:'Pratinjau lama',page_path:'/tasks',created_at:thread.created_at}]}))
  render(<AssistantWidget/>);fireEvent.click(screen.getByRole('button',{name:'Buka ATM Agent'}));fireEvent.click(screen.getByRole('tab',{name:'History'}))
  fireEvent.click(await screen.findByRole('button',{name:'Buka percakapan Tugas saya'}))
  await screen.findByText('Pratinjau lama');expect(screen.queryByRole('button',{name:'Konfirmasi'})).toBeNull()
  expect(fetch).toHaveBeenLastCalledWith('/api/assistant/conversations?id='+thread.id,expect.anything())
  fireEvent.click(screen.getByRole('button',{name:'Percakapan baru'}));expect(screen.queryByText('Pratinjau lama')).toBeNull()
 })
 it('provides a retry when history fails instead of inventing conversations',async()=>{
  vi.mocked(fetch).mockResolvedValueOnce(new Response('unavailable',{status:503}))
  render(<AssistantWidget/>);fireEvent.click(screen.getByRole('button',{name:'Buka ATM Agent'}));fireEvent.click(screen.getByRole('tab',{name:'History'}))
  expect(await screen.findByText(/Riwayat belum dapat dimuat/)).toBeTruthy();expect(screen.getByRole('button',{name:'Coba lagi'})).toBeTruthy()
 })

})
