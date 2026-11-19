// @vitest-environment jsdom
import {beforeEach,afterEach,expect,it,vi} from 'vitest'
import {render,screen,fireEvent,cleanup} from '@testing-library/react'
import Runner from './runner'
const revision='a'.repeat(40)
const snapshot={run:{id:'server-run',revision,status:'queued',reason:'',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),next_at:new Date().toISOString()},results:[{id:'01-R1',state:'done',attempts:1,result:{status:'PASS',reason:'Fixture',revision}},{id:'01-R2',state:'pending',attempts:0,result:null}]}
beforeEach(()=>{vi.stubGlobal('fetch',vi.fn())})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('starts server work through an explicit button and does not pause it when the page closes',async()=>{
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({run:null,results:[]})).mockResolvedValueOnce(Response.json(snapshot))
 const view=render(<Runner revision={revision}/>);const button=await screen.findByRole('button',{name:'Mulai evaluasi'})
 await screen.findByText('Siap memulai');fireEvent.click(button)
 await screen.findByText('Dalam antrean server')
 expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string)).toMatchObject({action:'start'})
 view.unmount();expect(fetch).toHaveBeenCalledTimes(2)
})
it('restores finished progress from the server without depending on sessionStorage',async()=>{
 vi.mocked(fetch).mockResolvedValue(Response.json(snapshot))
 render(<Runner revision={revision}/>);await screen.findByText('1/2');expect(screen.getByRole('row',{name:/01-R1.*PASS/})).toBeTruthy()
 expect(screen.getByRole('button',{name:'Berjalan di server'}).hasAttribute('disabled')).toBe(true)
})
