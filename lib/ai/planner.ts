import 'server-only'
import {validatePlan,type Plan,type Operation} from './contracts'
import {spokenPlan} from './conversation'
import {aiRolePolicy,aiRoleOperations,aiRoleReadAllowed} from './role-policy'
/** All planning is local. No provider, API key, network request or token quota. */
export function aiConfigured(){return true}
export async function planRequest(text:string,level:number,catalog:Record<string,Operation>,_history:string[]=[]):Promise<Plan> {
 void _history // Durable guided state is loaded by the service, not inferred from raw history.
 if(!aiRolePolicy(level))return {kind:'clarify',question:'Role akun tidak valid. Hubungi administrator.'}
 const plan=spokenPlan(text)
 if(!plan)return {kind:'clarify',question:'Saya belum yakin maksud Anda. Ingin melihat, membuat, mengubah, memindahkan, atau menghapus data? Sebutkan tugas atau fitur yang dimaksud. Contoh: “buka tugas Nata”, “pindahkan tugas rekonsiliasi ke berjalan”, atau “buat tugas berulang untuk Audrey”.'}
 if(plan.kind==='propose'&&!Object.hasOwn(aiRoleOperations(level,catalog),plan.operation??''))return {kind:'clarify',question:'Role akun Anda tidak memiliki izin untuk aksi tersebut.'}
 if(!aiRoleReadAllowed(level,plan))return {kind:'clarify',question:'Role akun Anda tidak memiliki izin membaca fitur tersebut.'}
 return validatePlan(plan,aiRoleOperations(level,catalog))
}
