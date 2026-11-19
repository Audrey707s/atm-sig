import 'server-only'
import {assistantStore} from './service'
import {processEvaluationQueue} from './evaluation-jobs'
import {modelPlan} from './evaluation-baseline/agent-model'
import source from './evaluation-baseline/source.json'
/** Private synthetic evaluator, bound to one existing run and its original planner. */
export async function processBoundEvaluation(){
 const runId=process.env.ATM_EVALUATION_RUN_ID
 if(!runId||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(runId))throw new Error('Evaluation run binding unavailable')
 const {data,error}=await assistantStore().from('atm_eval_runs').select('status,revision').eq('id',runId).abortSignal(AbortSignal.timeout(10000)).maybeSingle()
 if(error||!data||data.revision!==source.revision)throw new Error('Evaluation run binding unavailable')
 if(!['queued','running','waiting'].includes(data.status))return {processed:0,revision:source.revision,status:data.status}
 return processEvaluationQueue({revision:source.revision,planner:modelPlan,runId})
}
