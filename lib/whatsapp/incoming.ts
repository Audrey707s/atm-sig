import { createHash } from 'node:crypto'
export type FonnteIncoming = { id:string; sender:string; command:'link'|'help'|'stop'|'start'|'disconnect'|'tasks'|'reviews'|'detail'|'report'|'calendar'|'progress'|'confirm'|'cancel'|'choice'|'next'|'back'|'approve'|'mine'|'progress_list'|'identity'|'settings'; codeHash:string|null; args:Record<string,string|number> }
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
  let command:FonnteIncoming['command']=match?'link':/^stop$/i.test(text)?'stop':/^mulai$/i.test(text)?'start':/^putus$/i.test(text)?'disconnect':'help'
  const args:Record<string,string|number>={}
  const list=/^(TUGAS|REVIEW|KALENDER)(?:\s+([1-9]\d{0,2}|1000))?$/i.exec(text)
  const uuid='([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})'
  const detail=new RegExp('^DETAIL\\s+'+uuid+'$','i').exec(text)
  const progress=new RegExp('^PROGRES\\s+'+uuid+'\\s+(100|[1-9]?\\d)%?$','i').exec(text)
  const confirm=/^KONFIRMASI\s+([a-f0-9]{12})$/i.exec(text)
  if(list) {
    command=list[1].toUpperCase()==='TUGAS'?'tasks':list[1].toUpperCase()==='REVIEW'?'reviews':'calendar'
    args.page=Number(list[2]??1)
  } else if(detail) { command='detail';args.taskId=detail[1].toLowerCase() }
  else if(progress) {command='progress';args.taskId=progress[1].toLowerCase();args.progress=Number(progress[2])}
  else if(confirm) {command='confirm';args.token=confirm[1].toLowerCase()}
  else if(/^laporan$/i.test(text)) command='report'
  else if(/^batal$/i.test(text)) command='cancel'
  const shortcuts:Record<string,FonnteIncoming['command']>={saya:'mine',akun:'identity',notif:'settings',notifikasi:'settings',lanjut:'next',kembali:'back',ya:'approve',konfirmasi:'approve',progres:'progress_list',semua:'tasks',bantuan:'help'}
  if(shortcuts[text.toLowerCase()]) command=shortcuts[text.toLowerCase()]
  if(/^(100|[1-9]?\d)%?$/.test(text)) {command='choice';args.choice=Number(text.replace('%',''))}
  const id=createHash('sha256').update(JSON.stringify([p.device,p.sender,String(p.timestamp),p.inboxid??null,text])).digest('hex')
  return {id,sender:p.sender,command,codeHash:match?createHash('sha256').update(match[1].toLowerCase()).digest('hex'):null,args}
}
