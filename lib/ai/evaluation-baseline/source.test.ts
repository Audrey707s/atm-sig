import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {expect,it} from 'vitest'
import source from './source.json'
it('preserves the original planner, policies, fixture set and scoring semantics',()=>{
 expect(source.revision).toBe('c575e3496a7a7920f4cf33bbda79f0ea321b0fb1')
 for(const [path,expected] of Object.entries(source.originalSha256)){
  const clone=path==='lib/ai/evaluation.ts'||path.startsWith('docs/')?path:'lib/ai/evaluation-baseline/'+path.split('/').at(-1)
  const original=readFileSync(clone,'utf8').replace("from './chat-intents'","from '@/lib/tasks/chat-intents'").replace("model='openai/gpt-oss-20b'","model=process.env.ATM_AGENT_MODEL??'openai/gpt-oss-20b'")
  expect(createHash('sha256').update(original).digest('hex'),path).toBe(expected)
 }
})
