import { createHash } from 'node:crypto'
export type FonnteIncoming = { id:string; sender:string; command:'link'|'help'|'stop'|'start'|'disconnect'; codeHash:string|null }
export function parseFonnteIncoming(value:unknown,device:string,now=Date.now()): FonnteIncoming|null {
  if(!value||typeof value!=='object') return null
  const p=value as Record<string,unknown>
  if(p.device!==device||typeof p.sender!=='string'||!/^[1-9]\d{7,14}$/.test(p.sender)||p.member) return null
  if(typeof p.message!=='string'||p.message.length>4000) return null
  const rawTime=typeof p.timestamp==='number'?p.timestamp:typeof p.timestamp==='string'&&/^\d+$/.test(p.timestamp)?Number(p.timestamp):NaN
  const time=rawTime>1e12?rawTime:rawTime*1000
  if(!Number.isFinite(time)||Math.abs(now-time)>10*60_000) return null
  const text=p.message.trim()
  const match=/^HUBUNGKAN ([a-f0-9]{36})$/i.exec(text)
  const command=match?'link':/^stop$/i.test(text)?'stop':/^mulai$/i.test(text)?'start':/^putus$/i.test(text)?'disconnect':'help'
  const id=createHash('sha256').update(JSON.stringify([p.device,p.sender,String(p.timestamp),p.inboxid??null,text])).digest('hex')
  return {id,sender:p.sender,command,codeHash:match?createHash('sha256').update(match[1].toLowerCase()).digest('hex'):null}
}
