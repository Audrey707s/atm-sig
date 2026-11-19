import {timingSafeEqual} from 'node:crypto'
import {processEvaluationQueue} from '@/lib/ai/evaluation-jobs'
export const maxDuration=60
export async function POST(request:Request){
 const headers={'Cache-Control':'no-store'}
 if(process.env.VERCEL_ENV!=='preview'||process.env.ATM_AGENT_V2!=='on')return new Response('Not found',{status:404,headers})
 const secret=process.env.ATM_EVALUATION_WORKER_SECRET
 if(!secret)return new Response('Worker unavailable',{status:503,headers})
 const supplied=Buffer.from(request.headers.get('authorization')??''),expected=Buffer.from('Bearer '+secret)
 if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return new Response('Unauthorized',{status:401,headers})
 try{return Response.json(await processEvaluationQueue(),{headers})}catch(error){const message=error instanceof Error?error.message:'';const stage=message==='Evaluation revision unavailable'?'revision':message==='Assistant store unavailable'?'store':message==='Evaluation catalog unavailable'?'catalog':message==='Evaluation claim unavailable'?'claim':message==='Evaluation result persistence unavailable'?'save':'worker';console.error('[agent-evaluation-worker] unavailable',{stage});return Response.json({error:'Worker attempt failed; leases will recover.',stage},{status:503,headers})}
}
