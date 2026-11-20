import 'server-only'
import {assistantStore} from './service'
import {processEvaluationQueue,evaluationRevision} from './evaluation-jobs'
import {modelPlan as currentModelPlan} from './agent-model'
import {modelPlan} from './evaluation-baseline/agent-model'
import source from './evaluation-baseline/source.json'
/** Private synthetic evaluator, bound to explicit original/recheck runs and their respective planner revisions. */
export async function processBoundEvaluation(){
 const primary=process.env.ATM_EVALUATION_RUN_ID,recheck=process.env.ATM_EVALUATION_RECHECK_RUN_ID
 // Separate leases/results and alternating minutes; the old run is never reset.
 const isRecheck=!!recheck&&Math.floor(Date.now()/60000)%2===0
 const runId=isRecheck?recheck:primary
 const revision=isRecheck?evaluationRevision():source.revision
 if(!runId||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(runId))throw new Error('Evaluation run binding unavailable')
 const {data,error}=await assistantStore().from('atm_eval_runs').select('status,revision').eq('id',runId).abortSignal(AbortSignal.timeout(10000)).maybeSingle()
 if(error||!data||data.revision!==revision)throw new Error('Evaluation run binding unavailable')
 if(!['queued','running','waiting'].includes(data.status))return {processed:0,revision,status:data.status}
 return processEvaluationQueue({revision,planner:isRecheck?currentModelPlan:modelPlan,runId})
}
