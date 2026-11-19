import {notFound} from 'next/navigation'
import {createClient} from '@/lib/supabase/server'
import Runner from './runner'
export default async function AgentEvaluation(){
 if(process.env.VERCEL_ENV!=='preview'||process.env.ATM_AGENT_V2!=='on')notFound()
 const db=await createClient(),{data:{user}}=await db.auth.getUser()
 if(!user)notFound()
 const {data:profile}=await db.from('users').select('status,role:roles!users_role_id_fkey(level)').eq('id',user.id).single()
 if(profile?.status!=='aktif'||!profile.role||profile.role.level<5)notFound()
 return <Runner revision={process.env.VERCEL_GIT_COMMIT_SHA??'unknown'}/>
}
