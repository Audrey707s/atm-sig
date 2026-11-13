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

describe('WhatsApp structured task commands',()=>{
  const taskId='33333333-3333-4333-8333-333333333333'
  it.each([
    ['TUGAS','tasks',{page:1}],['TUGAS 2','tasks',{page:2}],['REVIEW','reviews',{page:1}],
    ['KALENDER 3','calendar',{page:3}],['LAPORAN','report',{}],['BATAL','cancel',{}],
    ['DETAIL '+taskId,'detail',{taskId}],['PROGRES '+taskId+' 55%','progress',{taskId,progress:55}],
    ['PROGRES '+taskId+' 0','progress',{taskId,progress:0}],['PROGRES '+taskId+' 100','progress',{taskId,progress:100}],
    ['KONFIRMASI ABCDEF123456','confirm',{token:'abcdef123456'}],
  ])('parses %s', (message,command,args)=>{
    const parsed=parseFonnteIncoming({...base,message},device,now)
    expect(parsed?.command).toBe(command);expect(parsed?.args).toEqual(args)
  })
  it.each(['TUGAS 0','TUGAS -1','TUGAS 1001','DETAIL undefined','PROGRES '+taskId+' 101','PROGRES '+taskId+' -1','PROGRES '+taskId+' 0.5','KONFIRMASI abc','please update '+taskId])('returns help for malformed commands: %s',message=>{
    expect(parseFonnteIncoming({...base,message},device,now)?.command).toBe('help')
  })
})

describe('Guided menu shortcuts',()=>{
 it.each([['1','choice',{choice:1}],['0','choice',{choice:0}],['50%','choice',{choice:50}],['100','choice',{choice:100}],['saya','mine',{}],['akun','identity',{}],['notif','settings',{}],['progres','progress_list',{}],['lanjut','next',{}],['kembali','back',{}],['ya','approve',{}],['menu','help',{}]])('understands %s',(message,command,args)=>{
  const r=parseFonnteIncoming({...base,message},device,now)
  expect(r?.command).toBe(command);expect(r?.args).toEqual(args)
 })
})


describe('Full-feature chat input',()=>{
 it.each(['BUAT','UBAH','HAPUS','DUPLIKASI','TINJAU','KOMENTAR','WBS','SUPPORT','BUKTI','TENGGAT','KATEGORI','BERULANG','ORGANISASI','PENGGUNA','FITUR','EKSPOR'])('routes %s to the feature workflow',message=>{
  const r=parseFonnteIncoming({...base,message},device,now)
  expect(r?.command).toBe('feature');expect(r?.args.feature).toBe(message)
 })
 it('preserves bounded form text while excluding raw linking codes',()=>{
  const text='judul: Tugas chat\nmulai: 2027-01-01 08:00\ntenggat: 2027-01-02 16:00'
  expect(parseFonnteIncoming({...base,message:text},device,now)?.text).toBe(text)
  expect(parseFonnteIncoming({...base,message:'HUBUNGKAN '+'b'.repeat(36)},device,now)?.text).toBeNull()
 })
})
