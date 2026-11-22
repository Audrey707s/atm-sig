import 'server-only'
import {assistantStore} from './service'
import {processEvaluationQueue} from './evaluation-jobs'
import {modelPlan as currentModelPlan} from './agent-model'
import {modelPlan} from './evaluation-baseline/agent-model'
import {assessPlan} from './evaluation'
import source from './evaluation-baseline/source.json'
/** Private synthetic evaluator, bound to explicit original/recheck runs and their respective planner revisions. */
export async function processBoundEvaluation(){
 const primary=process.env.ATM_EVALUATION_RUN_ID,fix=process.env.ATM_EVALUATION_FIX_RUN_ID
 // Production runs the explicitly bound current fix evaluation continuously.
 // Do not alternate with completed/canceled historical runs: doing so starves the
 // active queue and makes the worker heartbeat appear dead for multiple minutes.
 const runId=fix||primary
 const planner=fix?currentModelPlan:modelPlan
 if(!runId||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(runId))throw new Error('Evaluation run binding unavailable')
 const {data,error}=await assistantStore().from('atm_eval_runs').select('status,revision').eq('id',runId).abortSignal(AbortSignal.timeout(10000)).maybeSingle()
 // The explicit fix-run ID binds this worker to a stored semantic evaluation
 // revision. Unrelated deployment commits must not strand its pending cases.
 // Baseline runs remain pinned to their immutable baseline revision.
 if(error||!data||(!fix&&data.revision!==source.revision))throw new Error('Evaluation run binding unavailable')
 const revision=data.revision
 if(!['queued','running','waiting'].includes(data.status))return {processed:0,revision,status:data.status}
 return processEvaluationQueue({revision,planner,runId,...(fix?{}:{assessor:assessPlan})})
}
