import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {it,expect} from 'vitest'
import source from './source.json'
it('preserves the 60-case recheck planner when production changes',()=>{
 for(const [path,sha] of Object.entries(source.originalSha256)){
  const copy=readFileSync('lib/ai/evaluation-recheck-v1/'+path.split('/').at(-1),'utf8').replace("from './chat-intents'","from '@/lib/tasks/chat-intents'").replace("model='openai/gpt-oss-20b'","model=process.env.ATM_AGENT_MODEL??'openai/gpt-oss-20b'")
  expect(createHash('sha256').update(copy).digest('hex'),path).toBe(sha)
 }
})
