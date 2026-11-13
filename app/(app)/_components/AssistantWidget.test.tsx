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
  render(<AssistantWidget/>);fireEvent.click(screen.getByRole('button',{name:'Buka Asisten ATM'}))
  expect(screen.getByRole('dialog',{name:'Asisten ATM'})).toBeTruthy();fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'})
  expect(screen.queryByRole('dialog')).toBeNull();expect(document.activeElement).toBe(screen.getByRole('button',{name:'Buka Asisten ATM'}))
 })
 it('displays a preview and sends its server-issued token only after confirmation',async()=>{
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ok:true,message:'Pratinjau',pending:true,token:'server-token'})).mockResolvedValueOnce(Response.json({ok:true,message:'Berhasil',changed:true,path:'/tasks'}))
  render(<AssistantWidget/>);fireEvent.click(screen.getByRole('button',{name:'Buka Asisten ATM'}))
  fireEvent.change(screen.getByLabelText('Pesan untuk asisten'),{target:{value:'buat tugas'}});fireEvent.click(screen.getByRole('button',{name:'Kirim'}))
  await screen.findByText('Pratinjau');expect(fetch).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button',{name:'Konfirmasi'}));await screen.findByText('Berhasil')
  expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string)).toEqual({message:'YA',token:'server-token'})
  expect(refresh).toHaveBeenCalled();expect(screen.getByRole('link',{name:/Buka halaman/}).getAttribute('href')).toBe('/tasks')
 })
 it('handles failed replies and renders model text without HTML execution',async()=>{
  vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'))
  render(<AssistantWidget/>);fireEvent.click(screen.getByRole('button',{name:'Buka Asisten ATM'}))
  fireEvent.change(screen.getByLabelText('Pesan untuk asisten'),{target:{value:'<script>alert(1)</script>'}});fireEvent.click(screen.getByRole('button',{name:'Kirim'}))
  await waitFor(()=>expect(screen.getByText(/Balasan belum diterima/)).toBeTruthy());expect(document.querySelector('script')).toBeNull()
 })
})
