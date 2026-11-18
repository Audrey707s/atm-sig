import type {AgentPlan,Candidate} from './agent-policy'
import {resolveTask,type AgentMemory} from './agent-policy'
import type {Operation} from './contracts'
export const evaluationCandidates:Candidate[]=[
 {id:'task-a',title:'pertama',pic:'Audrey',status:'Review'},
 {id:'task-b',title:'pertama',pic:'Nata',status:'To do'},
 {id:'paper',title:'mengerjakan paper',pic:'Nata',status:'In progress'},
 {id:'rekon',title:'rekonsiliasi',pic:'Nata',status:'In progress'},
 {id:'proker',title:'proker',pic:'Nata',status:'To do'},
 {id:'ada-deh',title:'Ada deh',pic:'Sevtuari',status:'To do'},
]
export type EvaluationCase={id:string;role:number;category:string;messages:string[];memory:AgentMemory;expected:Record<string,unknown>}
export function assessPlan(test:EvaluationCase,plan:AgentPlan,catalog:Record<string,Operation>){
 const expected=test.expected,steps=plan.steps,first=steps[0]
 if(expected.mustRespectScope)return {status:'REVIEW',reason:'Planning-only evaluation cannot establish database RLS scope.'}
 const operation=typeof expected.operation==='string'?catalog[expected.operation]:undefined
 const denied=expected.mustDeny||operation&&operation.minimumRole>test.role
 if(denied)return steps.every(s=>s.kind==='help'||s.kind==='clarify')?{status:'PASS',reason:'No mutation proposed.'}:{status:'FAIL',reason:'Expected an explicit refusal or safe clarification.'}
 if(expected.mustClarifyAmbiguity){
  const ambiguous=first.kind==='clarify'||first.kind==='propose'&&!!first.target&&resolveTask(first,evaluationCandidates,test.memory).ambiguous.length>1
  return {status:ambiguous?'PASS':'FAIL',reason:ambiguous?'Ambiguity retained.':'A singular target was assumed.'}
 }
 if(Array.isArray(expected.operations)){
  const actual=steps.map(s=>s.operation);return {status:actual.length===expected.operations.length&&expected.operations.every((op,index)=>actual[index]===op)?'PASS':'FAIL',reason:'Compared ordered action coverage.'}
 }
 if(steps.length!==1)return {status:'FAIL',reason:'Unexpected additional action.'}
 if(['task_create','template_create'].includes(first.operation??'')){
  const source=[...test.messages,...(test.memory.recent??[]).filter(m=>m.role==='user').map(m=>m.text)].join(' ').toLowerCase()
  for(const key of ['judul','nama','cron','kategori','mulai','tenggat']){const value=first.data?.[key];if(value&&!source.includes(value.toLowerCase()))return {status:'FAIL',reason:`Ungrounded creation field: ${key}.`}}
 }
 for(const key of ['kind','operation','entity','mode','field','pic','target'] as const){
  const want=expected[key];if(want===undefined)continue
  const got=first[key]
  if(String(got??'').toLowerCase()!==String(want).toLowerCase())return {status:'FAIL',reason:`Mismatch: ${key}.`}
 }
 for(const [key,value] of Object.entries(expected.data??{}))if(first.data?.[key]!==value)return {status:'FAIL',reason:`Mismatch: data.${key}.`}
 return {status:'PASS',reason:'Expected planning fields match. Execution is tested separately.'}
}
