import { describe,expect,it } from 'vitest'
import { parseFonnteIncoming } from './incoming'
const now=Date.parse('2026-11-12T16:00:00Z')
const device='6281111111111'
const base={device,sender:'6282222222222',timestamp:now/1000,message:'MENU'}
describe('Fonnte incoming validation',()=>{
  it('creates stable receipts without exposing raw linking codes',()=>{
    const a=parseFonnteIncoming({...base,message:'HUBUNGKAN '+'a'.repeat(36)},device,now)!
    expect(a.command).toBe('link');expect(a.codeHash).toMatch(/^[a-f0-9]{64}$/)
    expect(a.id).toBe(parseFonnteIncoming({...base,message:'HUBUNGKAN '+'a'.repeat(36)},device,now)?.id)
    expect(JSON.stringify(a)).not.toContain('a'.repeat(36))
  })
  it.each(['STOP','MULAI','PUTUS','MENU'])('recognizes %s',message=>expect(parseFonnteIncoming({...base,message},device,now)).not.toBeNull())
  it.each([
    {device:'6283333333333'}, {sender:'123@g.us'}, {member:'6283333333333'},
    {timestamp:now/1000-601}, {timestamp:now/1000+601}, {timestamp:'invalid'}, {message:'x'.repeat(4001)},
  ])('rejects invalid or stale messages %j',change=>expect(parseFonnteIncoming({...base,...change},device,now)).toBeNull())
  it('accepts millisecond timestamps',()=>expect(parseFonnteIncoming({...base,timestamp:now},device,now)).not.toBeNull())
})
