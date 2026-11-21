import 'server-only'
import {assistantStore} from './service'
import {processEvaluationQueue,evaluationRevision} from './evaluation-jobs'
import {modelPlan as currentModelPlan} from './agent-model'
import {modelPlan} from './evaluation-baseline/agent-model'
import {assessPlan} from './evaluation'
import source from './evaluation-baseline/source.json'
/** Private synthetic evaluator, bound to explicit original/recheck runs and their respective planner revisions. */
export async function processBoundEvaluation(){
 const primary=process.env.ATM_EVALUATION_RUN_ID,recheck=process.env.ATM_EVALUATION_RECHECK_RUN_ID,fix=process.env.ATM_EVALUATION_FIX_RUN_ID
 // Production runs the explicitly bound current fix evaluation continuously.
 // Do not alternate with completed/canceled historical runs: doing so starves the
 // active queue and makes the worker heartbeat appear dead for multiple minutes.
 const runId=fix||primary
 const revision=fix?evaluationRevision():source.revision
 const planner=fix?currentModelPlan:modelPlan
 if(!runId||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(runId))throw new Error('Evaluation run binding unavailable')
 const {data,error}=await assistantStore().from('atm_eval_runs').select('status,revision').eq('id',runId).abortSignal(AbortSignal.timeout(10000)).maybeSingle()
 if(error||!data||data.revision!==revision)throw new Error('Evaluation run binding unavailable')
 if(!['queued','running','waiting'].includes(data.status))return {processed:0,revision,status:data.status}
 return processEvaluationQueue({revision,planner,runId,...(fix?{}:{assessor:assessPlan})})
}
