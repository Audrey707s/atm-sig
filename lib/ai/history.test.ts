import {describe,it,expect,vi} from 'vitest'
vi.mock('server-only',()=>({}))
import {finishChatTurn,safeChatPath} from './history'
import type {createClient} from '@/lib/supabase/server'
describe('history archive boundaries',()=>{
 it('does not persist confirmation tokens, operation metadata or private task snapshots',async()=>{
  const insert=vi.fn().mockResolvedValue({error:null}),eq=vi.fn(),update=vi.fn()
  eq.mockReturnValue({eq:()=>Promise.resolve({error:null})});update.mockReturnValue({eq})
  const client={from:()=>({insert,update})} as unknown as Awaited<ReturnType<typeof createClient>>
  await finishChatTurn(client,'user','thread',{ok:true,message:'Pratinjau',pending:true,token:'secret-token',path:'/tasks',rows:[{id:'private-task-id',title:'Private task'}]})
  const stored=JSON.stringify(insert.mock.calls)
  expect(stored).not.toContain('secret-token');expect(stored).not.toContain('private-task-id');expect(stored).not.toContain('Private task');expect(stored).toContain('1 hasil')
 })
 it('rejects external, protocol-relative and executable checking links',()=>{expect(safeChatPath('//evil.test')).toBeNull();expect(safeChatPath('javascript:alert(1)')).toBeNull();expect(safeChatPath('/tasks/abc')).toBe('/tasks/abc')})
 it('does not cut an emoji in half when building archive previews',async()=>{
  const insert=vi.fn().mockResolvedValue({error:null}),eq=vi.fn(),update=vi.fn()
  eq.mockReturnValue({eq:()=>Promise.resolve({error:null})});update.mockReturnValue({eq})
  const client={from:()=>({insert,update})} as unknown as Awaited<ReturnType<typeof createClient>>
  await finishChatTurn(client,'user','thread',{ok:true,message:'a'.repeat(159)+'😀'})
  expect(update.mock.calls[0][0].last_preview).toBe('a'.repeat(159)+'😀')
 })

})
