import {expect,it} from 'vitest'
import {assessPlan,type EvaluationCase} from './evaluation'
const base:EvaluationCase={id:'fixture',role:5,category:'test',messages:['x'],memory:{},expected:{kind:'propose',operation:'task_update',data:{prioritas:'tinggi'}}}
const catalog={task_update:{minimumRole:3,label:'Ubah',entity:'tasks',fields:{prioritas:'enum'},required:[],task:true}}
it('scores matching planning fields without claiming execution',()=>{expect(assessPlan(base,{steps:[{kind:'propose',operation:'task_update',data:{prioritas:'tinggi'}}]},catalog).status).toBe('PASS')})
it('does not pass the wrong action or field value',()=>{
 expect(assessPlan(base,{steps:[{kind:'propose',operation:'task_delete',data:{}}]},catalog).status).toBe('FAIL')
 expect(assessPlan(base,{steps:[{kind:'propose',operation:'task_update',data:{prioritas:'rendah'}}]},catalog).status).toBe('FAIL')
})
it('requires safe denial for a role without the mutation',()=>{
 expect(assessPlan({...base,role:1},{steps:[{kind:'clarify',question:'Tidak diizinkan'}]},catalog).status).toBe('PASS')
 expect(assessPlan({...base,role:1},{steps:[{kind:'propose',operation:'task_update',data:{prioritas:'tinggi'}}]},catalog).status).toBe('FAIL')
})
it('does not invent a passing RLS result from planning-only evaluation',()=>{expect(assessPlan({...base,expected:{mustRespectScope:true}},{steps:[{kind:'help'}]},catalog).status).toBe('REVIEW')})
it('preserves ambiguity instead of giving a selected target credit',()=>{
 const test={...base,expected:{mustClarifyAmbiguity:true}}
 expect(assessPlan(test,{steps:[{kind:'propose',operation:'task_delete',target:'pertama',data:{}}]},catalog).status).toBe('PASS')
 expect(assessPlan(test,{steps:[{kind:'propose',operation:'task_delete',target:'task-a',data:{}}]},catalog).status).toBe('FAIL')
})

it('does not reward a reordered multi-step request or invented creation fields',()=>{
 expect(assessPlan({...base,expected:{operations:['task_update','task_comment']}},{steps:[{kind:'propose',operation:'task_comment',data:{}},{kind:'propose',operation:'task_update',data:{}}]},catalog).status).toBe('FAIL')
 expect(assessPlan({...base,expected:{kind:'propose',operation:'template_create'}},{steps:[{kind:'propose',operation:'template_create',data:{judul:'Invented title'}}]},catalog).status).toBe('FAIL')
})
