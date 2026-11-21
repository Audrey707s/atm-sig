import {it,expect} from 'vitest'
import {assessCurrentPlan} from './evaluation-v2'
import {assessPlan} from './evaluation'
const catalog={task_update:{minimumRole:3,label:'Ubah',entity:'tasks',fields:{prioritas:'value'},required:[],task:true}}
const test={id:'multi',role:2,category:'multi',messages:['ubah prioritas sekalian komentar'],memory:{},expected:{operations:['task_update','task_comment']}}
it('corrects only current scoring for an unauthorized multi-intent without altering old scoring',()=>{
 const refusal={steps:[{kind:'clarify' as const,question:'Tidak diizinkan'}]}
 expect(assessCurrentPlan(test,refusal,catalog).status).toBe('PASS')
 expect(assessPlan(test,refusal,catalog).status).toBe('FAIL')
 expect(assessCurrentPlan(test,{steps:[{kind:'propose',operation:'task_update',data:{}}]},catalog).status).toBe('FAIL')
})
