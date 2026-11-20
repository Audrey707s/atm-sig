import {beforeEach,expect,it,vi} from 'vitest'
vi.mock('server-only',()=>({}))
const m=vi.hoisted(()=>({rpc:vi.fn(),dispatch:vi.fn(),legacy:vi.fn(),plan:vi.fn(),configured:vi.fn()}))
vi.mock('./service',()=>({assistantStore:()=>({rpc:m.rpc}),dispatch:m.dispatch,requestLegacyAssistant:m.legacy}))
vi.mock('./agent-model',()=>({modelConfigured:m.configured,modelPlan:m.plan}))
import {requestAgent} from './orchestrator'
const turn={actor:'actor',level:6,channel:'web' as const,requestId:'12345678-1234-4234-8234-123456789abc'}
const catalog={task_update:{task:true},task_delete:{task:true}}
beforeEach(()=>{
 m.rpc.mockImplementation(async(name)=>({data:name==='atm_agent_claim'?{lease:'lease',memory:{}}:name==='wa_operation_catalog'?catalog:[{id:'task-a',title:'mengerjakan paper',pic:'Nata',status:'To do'}],error:null}))
 m.configured.mockReturnValue(true);m.dispatch.mockResolvedValue({ok:true,message:'backend'});m.legacy.mockResolvedValue({ok:true,message:'backend'})
 m.plan.mockResolvedValue({plan:{steps:[{kind:'propose',operation:'task_update',target:'mengerjakan paper',pic:'Nata',data:{prioritas:'tinggi'}}]},model:'test-model',usage:{input:50,output:20}})
})
it('passes the raw everyday utterance to the planner and only verified resolution to the executor',async()=>{
 const text='tugas "mengerjakan paper" milik PIC nata tolong diubah prioritasnya menjadi tinggi'
 await requestAgent(turn,text)
 expect(m.plan).toHaveBeenCalledWith(text,6,catalog,expect.anything(),expect.anything())
 expect(m.legacy).toHaveBeenCalledWith(expect.objectContaining({agent:expect.objectContaining({lease:'lease',input:50})}),text,undefined,undefined,expect.objectContaining({target:'task-a',exact:true,pic:'Nata'}))
})
it('does not plan or execute a finalized replay',async()=>{
 m.rpc.mockResolvedValueOnce({data:{cached:{ok:true,message:'verified result'}},error:null})
 expect(await requestAgent(turn,'ulang')).toEqual({ok:true,message:'verified result',duplicate:true})
 expect(m.plan).not.toHaveBeenCalled();expect(m.legacy).not.toHaveBeenCalled()
})
it('never executes when another message owns the conversation lease',async()=>{
 m.rpc.mockResolvedValueOnce({data:null,error:{message:'busy'}})
 await expect(requestAgent(turn,'hapus sesuatu')).rejects.toThrow('claim')
 expect(m.plan).not.toHaveBeenCalled();expect(m.legacy).not.toHaveBeenCalled()
})
it('routes an ordered multi-intent to the atomic batch executor',async()=>{
 m.plan.mockResolvedValueOnce({plan:{steps:[{kind:'propose',operation:'task_update',target:'mengerjakan paper',data:{prioritas:'tinggi'}},{kind:'propose',operation:'task_delete',target:'mengerjakan paper',data:{}}]},model:'test-model',usage:{input:50,output:20}})
 await requestAgent(turn,'ubah prioritas paper sekalian hapus paper')
 expect(m.dispatch).toHaveBeenCalledWith(expect.anything(),'batch',{steps:expect.arrayContaining([expect.objectContaining({operation:'task_update'}),expect.objectContaining({operation:'task_delete'})])})
 expect(m.legacy).not.toHaveBeenCalled()
})
it('does not accept a model-invented task UUID unrelated to the user reference',async()=>{
 m.plan.mockResolvedValueOnce({plan:{steps:[{kind:'propose',operation:'task_delete',target:'12345678-1234-4234-8234-123456789def',data:{}}]},model:'test-model',usage:{input:0,output:0}})
 await requestAgent(turn,'hapus paper')
 expect(m.dispatch).toHaveBeenCalledWith(expect.anything(),'reply',expect.anything());expect(m.legacy).not.toHaveBeenCalled()
})
it('keeps an honest legacy path when the free provider is unavailable',async()=>{
 m.configured.mockReturnValue(false)
 await requestAgent(turn,'tugas saya')
 expect(m.plan).not.toHaveBeenCalled();expect(m.legacy).toHaveBeenCalledWith(expect.anything(),'tugas saya',undefined,undefined)
})

it('answers a verified contextual read without invoking the provider',async()=>{
 m.rpc.mockResolvedValueOnce({data:{lease:'lease',memory:{activeTask:'task-a'}},error:null})
 await requestAgent(turn,'yang tadi tenggatnya kapan?')
 expect(m.plan).not.toHaveBeenCalled()
 expect(m.legacy).toHaveBeenCalledWith(expect.anything(),'yang tadi tenggatnya kapan?',undefined,undefined,{kind:'read',entity:'tasks',mode:'list',query:'task-a'})
})

it('fills a known pending reason from everyday text without asking the model again',async()=>{
 m.rpc.mockResolvedValueOnce({data:{lease:'lease',memory:{draft:{operation:'task_reassign',target:'task-a',payload:{guided:true,field:'alasan',data:{pic:'Nata'}}}}},error:null})
 await requestAgent(turn,'karena pembagian tim')
 expect(m.plan).not.toHaveBeenCalled()
 expect(m.legacy).toHaveBeenCalledWith(expect.anything(),'karena pembagian tim',undefined,undefined,expect.objectContaining({operation:'task_reassign',target:'task-a',data:{pic:'Nata',alasan:expect.stringContaining('pembagian tim')}}))
})

it.each(['web','whatsapp'] as const)('does not guess an action from an owner-only follow-up on %s',async channel=>{
 m.rpc.mockResolvedValueOnce({data:{lease:'lease',memory:{activePIC:'Audrey'}},error:null})
 await requestAgent({...turn,channel},'sekalian untuk punya dia juga')
 expect(m.plan).not.toHaveBeenCalled();expect(m.legacy).not.toHaveBeenCalled()
 expect(m.dispatch).toHaveBeenCalledWith(expect.anything(),'reply',{message:expect.stringContaining('Apa yang ingin dilakukan untuk Audrey?')})
})
it('retains a pending action for an additive follow-up instead of discarding its context',async()=>{
 m.rpc.mockResolvedValueOnce({data:{lease:'lease',memory:{activePIC:'Audrey',pending:[{kind:'propose',operation:'task_update',data:{prioritas:'tinggi'}}]}},error:null})
 await requestAgent(turn,'sekalian untuk punya dia juga')
 expect(m.plan).toHaveBeenCalled()
})
