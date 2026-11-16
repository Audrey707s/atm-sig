import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {aiRolePolicy,aiRoleOperations,aiRoleReadAllowed} from './role-policy'
import type {Operation} from './contracts'
const source=readFileSync('supabase/migrations/20261116105757_ai_conversation_grounding.sql','utf8')
const catalog=JSON.parse(source.match(/\$json\$([\s\S]*?)\$json\$/)![1]) as Record<string,Operation>
describe('explicit AI policy for all six roles',()=>{
 it.each([[1,'Spectator'],[2,'Staff/PIC'],[3,'Manager'],[4,'SM'],[5,'GM'],[6,'Super Admin']])('assigns a distinct profile to role %s', (level,name)=>{
  const policy=aiRolePolicy(level as number)!
  expect(policy.name).toBe(name);expect(policy.scope.length).toBeGreaterThan(40)
  const allowed=aiRoleOperations(level as number,catalog)
  for(const [operation,spec] of Object.entries(catalog))expect(Object.hasOwn(allowed,operation)).toBe(spec.minimumRole<=(level as number))
  expect(Object.hasOwn(allowed,'org_create')).toBe(level===6)
  expect(Object.hasOwn(allowed,'task_delete')).toBe((level as number)>=3)
  expect(aiRoleReadAllowed(level as number,{kind:'read',entity:'approvals'})).toBe((level as number)>=4)
  expect(aiRoleReadAllowed(level as number,{kind:'read',entity:'users'})).toBe((level as number)>=3)
 })
 it.each([0,7,99,-1,NaN,2.5])('fails closed for invalid level %s',level=>{
  expect(aiRolePolicy(level)).toBeNull();expect(aiRoleOperations(level,catalog)).toEqual({})
  expect(aiRoleReadAllowed(level,{kind:'read',entity:'tasks'})).toBe(false)
 })
})
