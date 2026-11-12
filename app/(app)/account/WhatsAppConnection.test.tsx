// @vitest-environment jsdom
import React from 'react'
import { act,cleanup,fireEvent,render,screen } from '@testing-library/react'
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
const mocks=vi.hoisted(()=>({refresh:vi.fn(),begin:vi.fn(),get:vi.fn(),disconnect:vi.fn(),notifications:vi.fn()}))
const router={refresh:mocks.refresh}
vi.mock('next/navigation',()=>({useRouter:()=>router}))
vi.mock('@/lib/whatsapp/linking',()=>({beginWhatsAppLink:mocks.begin,getMyWhatsApp:mocks.get,disconnectWhatsApp:mocks.disconnect,setWhatsAppNotifications:mocks.notifications}))
import WhatsAppConnection from './WhatsAppConnection'
describe('WhatsApp connection status and actions',()=>{
 beforeEach(()=>{
  vi.useFakeTimers();vi.clearAllMocks()
  Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'})
  Object.defineProperty(navigator,'onLine',{configurable:true,value:true})
  mocks.begin.mockResolvedValue({code:'a'.repeat(36),bot:'6281111111111',expires:new Date(Date.now()+600_000).toISOString()})
  mocks.get.mockResolvedValue({enabled:true,phone:null,notifications:false})
  mocks.disconnect.mockResolvedValue({success:true});mocks.notifications.mockResolvedValue({success:true})
 })
 afterEach(()=>{cleanup();vi.useRealTimers()})
 async function begin(){await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Hubungkan WhatsApp'}))})}
 it('removes the old check button and automatically detects a completed link',async()=>{
  render(<WhatsAppConnection phone={null} notifications={false}/>);await begin()
  expect(screen.queryByRole('button',{name:'Periksa koneksi'})).toBeNull()
  expect(screen.getByRole('link',{name:'Buka WhatsApp'}).getAttribute('href')).toContain('HUBUNGKAN')
  mocks.get.mockResolvedValue({enabled:true,phone:'6282222222222',notifications:true})
  await act(async()=>{vi.advanceTimersByTime(5000)})
  expect(screen.getByText('+6282222222222')).toBeTruthy();expect(mocks.refresh).toHaveBeenCalledOnce()
 })
 it('does not claim connected when the server check fails',async()=>{
  render(<WhatsAppConnection phone={null} notifications={false}/>);await begin();mocks.get.mockRejectedValue(new Error('offline'))
  await act(async()=>{vi.advanceTimersByTime(5000)})
  expect(screen.getByText('Menunggu pesan penghubung…')).toBeTruthy();expect(mocks.refresh).not.toHaveBeenCalled()
 })
 it('expires the linking code and cleans up polling',async()=>{
  render(<WhatsAppConnection phone={null} notifications={false}/>);await begin()
  await act(async()=>{vi.advanceTimersByTime(600_000)})
  expect(screen.getByText(/Kode kedaluwarsa/)).toBeTruthy()
  const count=mocks.get.mock.calls.length
  await act(async()=>{vi.advanceTimersByTime(10_000)})
  expect(mocks.get.mock.calls.length).toBe(count)
 })
 it('keeps notification and unlink actions functional',async()=>{
  render(<WhatsAppConnection phone="6282222222222" notifications={true}/>)
  await act(async()=>{fireEvent.click(screen.getByRole('checkbox'))})
  expect(mocks.notifications).toHaveBeenCalledWith(false)
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Putuskan koneksi'}))})
  expect(mocks.disconnect).toHaveBeenCalledOnce()
 })
})
