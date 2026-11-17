import type {Plan} from './contracts'
import {normalizeTaskReference,taskMutationReference} from '@/lib/tasks/chat-intents'
const fieldNames='tanggal mulai|penanggung jawab|prioritas|priority|status|progress|progres|tenggat|deadline|judul|nama|mulai|pic'
const active='ubah|ganti|edit|update|perbarui|set|naikkan|turunkan'
const passive='diubah|diganti|diedit|diupdate|diperbarui|dinaikkan|diturunkan'
/** Match syntax outside literal quoted titles, but return their original spelling. */
function matchSyntax(pattern:string,text:string):string[]|null {
 const masked=text.replace(/["“][^"”]*["”]|'[^']*'/g,value=>'\ue000'.repeat(value.length))
 const found=new RegExp(pattern,'id').exec(masked)
 if(!found?.indices)return null
 return found.indices.map(range=>range?text.slice(range[0],range[1]):'')
}
export function priorityValue(value:string):string|undefined {
 const text=value.trim().toLowerCase()
 return /^(?:tinggi|high|mendesak|urgent)$/.test(text)?'tinggi':/^(?:sedang|medium|normal)$/.test(text)?'sedang':/^(?:rendah|low)$/.test(text)?'rendah':undefined
}
export function taskFieldPlan(text:string,status:(value:string)=>string|undefined):Plan|null {
 const contextual=matchSyntax(`^(${fieldNames})(?:\\s*-?\\s*nya\\b)?\\s+(?:menjadi|jadi|ke|sebesar)\\s+(.+)$`,text)
 if(contextual)return taskFieldPlan('ubah '+text,status)
 let field:string,reference:string,value=''
 // Verb + field + target, optionally followed by a value.
 const first=matchSyntax(`^(?:${active})\\s+(${fieldNames})(?:\\s*-?\\s*nya\\b)?(?:\\s+(?:tugas|task))?\\s*(.*)$`,text)
 if(first){field=first[1];const tail=first[2]
  const divided=matchSyntax('^(.*?)\\s+(?:menjadi|jadi|ke|sebesar)\\s+(.+)$',tail)
  const short=matchSyntax('^(?:menjadi|jadi|ke|sebesar)\\s+(.+)$',tail)
  if(short){reference='';value=short[1]}else if(divided){reference=divided[1];value=divided[2]}else reference=tail
  if(/^nama$/i.test(field)&&/^(?:profil|akun|organisasi|kategori|jadwal)\b/i.test(reference))return null
  if(/^(?:pic|penanggung jawab)$/i.test(field)&&!value&&!new RegExp('(?:pic|penanggung jawab)(?:\\s*-?\\s*nya\\b)?\\s+(?:tugas|task)\\b','i').test(text)){value=reference;reference=''}
 }else{
  // Target + verb + field, or target + field + passive verb.
  const last=matchSyntax(`^(?:tugas|task)\\s+(.+?)\\s+(?:tolong\\s+|mohon\\s+)?(?:${passive}|${active})\\s+(${fieldNames})(?:\\s*-?\\s*nya\\b)?\\s*(.*)$`,text)
  const middle=last?null:matchSyntax(`^(?:tugas|task)\\s+(.+?)\\s+(${fieldNames})(?:\\s*-?\\s*nya\\b)?\\s+(?:${passive}|${active}|jadi|menjadi)\\s*(.*)$`,text)
  const fieldFirst=last||middle?null:matchSyntax(`^(${fieldNames})(?:\\s*-?\\s*nya\\b)?\\s+(?:tugas|task)\\s+(.+?)\\s+(?:tolong\\s+)?(?:${passive})(?:\\s+(?:menjadi|jadi|ke|sebesar))?\\s*(.*)$`,text)
  if(last||middle){const part=(last??middle)!;reference=part[1];field=part[2];value=part[3]}
  else if(fieldFirst){field=fieldFirst[1];reference=fieldFirst[2];value=fieldFirst[3]}
  else return null
 }
 field=({priority:'prioritas',progress:'progres',deadline:'tenggat',nama:'judul','tanggal mulai':'mulai','penanggung jawab':'pic'} as Record<string,string>)[field.toLowerCase()]??field.toLowerCase()
 value=value.replace(/^(?:menjadi|jadi|ke|sebesar)\s+/i,'').trim()
 if(!value&&field==='prioritas'&&priorityValue(reference)){value=reference;reference=''}
 if(!value&&field==='status'&&status(reference)){value=reference;reference=''}
 const reason=['pic','tenggat'].includes(field)?matchSyntax('^(.*?)\\s+(?:karena|dengan alasan)\\s+(.+)$',value):null
 if(reason)value=reason[1]
 const normalized=field==='prioritas'?priorityValue(value):field==='status'?status(value):field==='progres'?value.match(/^(\d{1,3})\s*(?:%|persen)?$/i)?.[1]:value?normalizeTaskReference(value).text:undefined
 const operation=field==='status'?'task_status':field==='progres'?'task_progress':field==='pic'?'task_reassign':field==='tenggat'?'task_deadline':'task_update'
 const target=taskMutationReference(reference.replace(/^(?:tugas|task)(?:\s+berjudul)?\s+/i,''))
 return {kind:'propose',operation,field,...(reference?{...target,target:target.context?undefined:target.target}:{context:true}),data:{...(normalized?{[field]:normalized}:{}),...(reason?{alasan:reason[2]}:{})}}
}
