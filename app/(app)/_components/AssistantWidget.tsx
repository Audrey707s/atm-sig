'use client'
import Link from 'next/link'
import {useEffect,useRef,useState,type KeyboardEvent} from 'react'
import {useRouter} from 'next/navigation'
import ATMWordmark from '@/app/_components/ATMWordmark'
import type {AssistantReply} from '@/lib/ai/contracts'
import type {ChatThread,ChatEntry,HelpTopic} from '@/lib/ai/history-contracts'
import s from './AssistantWidget.module.css'
type Tab='chat'|'help'|'history'
type Message={id:string;who:'user'|'assistant';text:string;at?:string;reply?:AssistantReply}
const welcome:Message={id:'welcome',who:'assistant',text:'Halo! Ada yang bisa saya bantu hari ini? Saya siap membantu tugas dan pekerjaan Anda.'}
const tabs:{key:Tab;label:string;icon:IconName}[]=[{key:'chat',label:'Chat',icon:'chat'},{key:'help',label:'Helpdesk',icon:'help'},{key:'history',label:'History',icon:'history'}]
const titles:Record<string,string>={tasks:'Mengelola tugas',review:'Review & persetujuan',categories:'Kategori tugas',templates:'Tugas berulang',organizations:'Struktur organisasi',reports:'Laporan & ekspor',calendar:'Kalender pekerjaan',users:'Pengelolaan pengguna',security:'Akun & keamanan',wbs:'WBS & progres',support:'Permintaan support',evidence:'Bukti pekerjaan',notifications:'Notifikasi & reminder'}
const suggestions=[['Lihat tugas saya','lihat tugas saya'],['Ringkasan pekerjaan','ringkasan tugas'],['Tenggat 7 hari ke depan','kalender'],['Panduan menggunakan ATM','cara menggunakan tugas']]
type IconName='chat'|'help'|'history'|'close'|'down'|'plus'|'send'|'search'|'arrow'
function Icon({name,size=16}:{name:IconName;size?:number}){
 const paths:Record<IconName,string>={chat:'M21 11.5a8.5 8.5 0 0 1-8.5 8.5H5l-3 2V11.5a9.5 9.5 0 0 1 19 0ZM8 10h8M8 14h5',help:'M12 17h.01M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',history:'M3 11a9 9 0 1 1 2.8 7M3 4v7h7M12 7v5l3 2',close:'m6 6 12 12M6 18 18 6',down:'m6 9 6 6 6-6',plus:'M12 5v14M5 12h14',send:'m12 5 7 7M12 5l-7 7M12 5v15',search:'m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',arrow:'M5 12h14m-5-5 5 5-5 5'}
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>
}
function safePath(path?:string){return path&&/^\/(?!\/)[a-z0-9/_?=&%-]*$/i.test(path)?path:undefined}
function time(at?:string){return at?new Intl.DateTimeFormat('id-ID',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jakarta'}).format(new Date(at)):''}
function date(at:string){return new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jakarta'}).format(new Date(at))}
function ReplyDetails({reply}:{reply:AssistantReply}){
 return <>
  {Array.isArray(reply.rows)&&<div className={s.dataList}>{reply.rows.slice(0,20).map((r,i)=><div key={String(r.id??i)} className={s.dataItem}><div className={s.dataTitle}>{String(r.title??r.label??'Data')}</div><div className={s.dataMeta}>{String(r.status??r.details??'')}{r.due?' · '+String(r.due)+' WIB':''}</div>{Boolean(r.id)&&<div className={s.dataId}>ID: {String(r.id)}</div>}{Boolean(r.title)&&/^[a-f0-9-]{36}$/i.test(String(r.id))&&<Link href={'/tasks/'+String(r.id)} className={s.link}>Lihat tugas <Icon name="arrow" size={12}/></Link>}</div>)}{reply.rows.length===0&&<p>Tidak ada hasil.</p>}</div>}
  {reply.rows&&!Array.isArray(reply.rows)&&<dl className={s.metrics}>{Object.entries(reply.rows).map(([k,v])=><div key={k} className={s.metric}><dt>{({total:'Total',done:'Selesai',review:'Review',overdue:'Lewat tenggat'} as Record<string,string>)[k]??k}</dt><dd>{String(v)}</dd></div>)}</dl>}
  {safePath(reply.path)&&<Link href={safePath(reply.path)!} className={s.link}>Buka halaman terkait <Icon name="arrow" size={12}/></Link>}
 </>
}
export default function AssistantWidget({helpTopics=[]}:{helpTopics?:HelpTopic[]}){
 const [open,setOpen]=useState(false),[tab,setTab]=useState<Tab>('chat'),[messages,setMessages]=useState<Message[]>([welcome]),[input,setInput]=useState(''),[busy,setBusy]=useState(false),[pending,setPending]=useState<string>(),[conversation,setConversation]=useState<string>(),[archived,setArchived]=useState(false),[position,setPosition]=useState({right:20,bottom:80})
 const [threads,setThreads]=useState<ChatThread[]>([]),[historyLoading,setHistoryLoading]=useState(false),[historyError,setHistoryError]=useState(''),[search,setSearch]=useState(''),[article,setArticle]=useState<string>()
 const launcher=useRef<HTMLButtonElement>(null),field=useRef<HTMLTextAreaElement>(null),content=useRef<HTMLDivElement>(null),abort=useRef<AbortController|null>(null),busyRef=useRef(false),stick=useRef(true),historyGeneration=useRef(0),tabRefs=useRef<(HTMLButtonElement|null)[]>([])
 const drag=useRef<{x:number;y:number;right:number;bottom:number}|null>(null),moved=useRef(false),router=useRouter()
 useEffect(()=>{if(open&&tab==='chat'&&(typeof window.matchMedia!=='function'||window.matchMedia('(pointer:fine)').matches))field.current?.focus({preventScroll:true})},[open,tab])
 useEffect(()=>{if(open&&tab==='chat'&&stick.current&&content.current)content.current.scrollTop=content.current.scrollHeight},[open,tab,messages,busy])
 useEffect(()=>{const resize=()=>setPosition(p=>({right:Math.min(Math.max(12,p.right),Math.max(12,window.innerWidth-68)),bottom:Math.min(Math.max(20,p.bottom),Math.max(20,window.innerHeight-68))}));window.addEventListener('resize',resize);return()=>{window.removeEventListener('resize',resize);abort.current?.abort();historyGeneration.current=-1}},[])
 function close(){setOpen(false);launcher.current?.focus()}
 function newChat(){if(busyRef.current)return;historyGeneration.current++;setConversation(undefined);setMessages([welcome]);setPending(undefined);setInput('');setArchived(false);setTab('chat');stick.current=true;field.current?.focus()}
 async function loadHistory(){
  setTab('history');setHistoryLoading(true);setHistoryError('');const generation=++historyGeneration.current
  try{const r=await fetch('/api/assistant/conversations',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('History unavailable');const body=await r.json();if(generation===historyGeneration.current)setThreads(body.threads??[])}catch{if(generation===historyGeneration.current)setHistoryError('Riwayat belum dapat dimuat. Silakan coba lagi.')}finally{if(generation===historyGeneration.current)setHistoryLoading(false)}
 }
 async function openThread(thread:ChatThread){
  if(busyRef.current)return;setHistoryLoading(true);setHistoryError('');const generation=++historyGeneration.current
  try{
   const r=await fetch('/api/assistant/conversations?id='+encodeURIComponent(thread.id),{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('History unavailable')
   const body=await r.json() as {messages:ChatEntry[]};if(generation!==historyGeneration.current)return
   setMessages(body.messages.length?body.messages.map(m=>({id:m.id,who:m.author,text:m.content,at:m.created_at,reply:m.page_path?{ok:true,message:m.content,path:m.page_path}:undefined})):[welcome]);setConversation(thread.id);setPending(undefined);setArchived(true);setInput('');stick.current=true;setTab('chat')
  }catch{if(generation===historyGeneration.current)setHistoryError('Percakapan belum dapat dibuka. Silakan coba lagi.')}finally{if(generation===historyGeneration.current)setHistoryLoading(false)}
 }
 function selectTab(next:Tab){if(next==='history')void loadHistory();else{historyGeneration.current++;setHistoryLoading(false);setTab(next)}}
 function tabKey(event:KeyboardEvent<HTMLButtonElement>,index:number){const next=event.key==='ArrowRight'?(index+1)%3:event.key==='ArrowLeft'?(index+2)%3:event.key==='Home'?0:event.key==='End'?2:-1;if(next>=0){event.preventDefault();selectTab(tabs[next].key);tabRefs.current[next]?.focus()}}
 async function send(text:string){
  if(busyRef.current||!text.trim())return
  busyRef.current=true;setBusy(true);const confirmation=/^(ya|konfirmasi)$/i.test(text.trim()),token=confirmation?pending:undefined
  const requestAt=new Date().toISOString();stick.current=true;setArchived(false);setTab('chat');setMessages(ms=>[...ms.slice(-99),{id:crypto.randomUUID(),who:'user',text,at:requestAt}]);setInput('');setPending(undefined)
  if(field.current)field.current.style.height='auto'
  const controller=new AbortController();abort.current=controller;const timer=setTimeout(()=>controller.abort(),45000)
  try{
   let id=conversation
   if(!id){const r=await fetch('/api/assistant/conversations',{method:'POST',credentials:'same-origin',signal:controller.signal});if(!r.ok)throw new Error('Conversation unavailable');const body=await r.json();id=body.thread.id as string;setConversation(id)}
   const response=await fetch('/api/assistant',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text,token,conversationId:id}),signal:controller.signal})
   if(response.status===401||(response.redirected&&new URL(response.url).pathname.startsWith('/login'))){router.push('/login');return}
   if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('Invalid response')
   const reply=await response.json() as AssistantReply
   setMessages(ms=>[...ms,{id:crypto.randomUUID(),who:'assistant',text:reply.message,reply,at:new Date().toISOString()}]);setPending(reply.pending?reply.token:undefined)
   if(reply.changed)router.refresh()
  }catch{setMessages(ms=>[...ms,{id:crypto.randomUUID(),who:'assistant',text:'Pesan belum dapat diproses. Periksa halaman terkait sebelum mengulangi perubahan.',at:new Date().toISOString()}])}
  finally{clearTimeout(timer);busyRef.current=false;setBusy(false);abort.current=null}
 }
 const filteredHelp=helpTopics.filter(h=>(titles[h.topic]+' '+h.text).toLowerCase().includes(search.toLowerCase()))
 return <>
  <button ref={launcher} type="button" aria-label={open?'Tutup ATM Agent':'Buka ATM Agent'} aria-expanded={open} aria-controls="atm-agent" title="ATM Agent — geser untuk memindahkan" className={s.launcher} style={position}
   onPointerDown={e=>{if(e.button!==0)return;drag.current={x:e.clientX,y:e.clientY,...position};moved.current=false;e.currentTarget.setPointerCapture?.(e.pointerId)}}
   onPointerMove={e=>{const d=drag.current;if(!d)return;if(Math.abs(e.clientX-d.x)+Math.abs(e.clientY-d.y)>6){moved.current=true;setPosition({right:Math.min(Math.max(12,d.right+d.x-e.clientX),Math.max(12,window.innerWidth-68)),bottom:Math.min(Math.max(20,d.bottom+d.y-e.clientY),Math.max(20,window.innerHeight-68))})}}}
   onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null;moved.current=true}}
   onKeyDown={e=>{const v:Record<string,[number,number]>={ArrowLeft:[20,0],ArrowRight:[-20,0],ArrowUp:[0,20],ArrowDown:[0,-20]};if(v[e.key]){e.preventDefault();const [x,y]=v[e.key];setPosition(p=>({right:Math.min(Math.max(12,p.right+x),Math.max(12,window.innerWidth-68)),bottom:Math.min(Math.max(20,p.bottom+y),Math.max(20,window.innerHeight-68))}))}}}
   onClick={()=>{if(!moved.current)setOpen(o=>!o);moved.current=false}}><Icon name="chat" size={25}/></button>
  {open&&<section id="atm-agent" role="dialog" aria-label="ATM Agent" className={s.panel} onKeyDown={e=>{if(e.key==='Escape')close()}}>
   <header className={s.brandBar}><ATMWordmark className={s.logo}/><div className={s.barActions}><button type="button" className={s.iconButton} aria-label="Percakapan baru" title="Percakapan baru" disabled={busy} onClick={newChat}><Icon name="plus"/></button><button type="button" className={s.iconButton} aria-label="Minimalkan ATM Agent" onClick={close}><Icon name="down"/></button><button type="button" className={s.iconButton} aria-label="Tutup chat" onClick={close}><Icon name="close"/></button></div></header>
   <div className={s.intro}><div className={s.introTop}><div><h2>ATM Agent</h2><p>Bantuan untuk pekerjaan Anda.</p></div></div><div role="tablist" aria-label="Menu ATM Agent" className={s.tabs}>{tabs.map((t,i)=><button key={t.key} ref={el=>{tabRefs.current[i]=el}} id={'agent-tab-'+t.key} role="tab" type="button" aria-selected={tab===t.key} aria-controls={'agent-panel-'+t.key} tabIndex={tab===t.key?0:-1} className={s.tab} onKeyDown={e=>tabKey(e,i)} onClick={()=>selectTab(t.key)}><Icon name={t.icon} size={14}/>{t.label}</button>)}</div></div>
   <div ref={content} id={'agent-panel-'+tab} role="tabpanel" aria-labelledby={'agent-tab-'+tab} className={s.content} onScroll={e=>{stick.current=e.currentTarget.scrollHeight-e.currentTarget.scrollTop-e.currentTarget.clientHeight<80}}>
    {tab==='chat'&&<>{archived&&<div className={s.archiveNote}><Icon name="history" size={12}/>Riwayat percakapan Anda</div>}<div role="log" aria-live="polite" aria-relevant="additions" className={s.chatLog}>{messages.map(m=><div key={m.id} className={`${s.message} ${m.who==='user'?s.outgoing:''}`}>
     {m.who==='assistant'&&<span className={s.avatar}><Icon name="chat" size={14}/></span>}<div className={s.bubbleWrap}><div className={s.bubble}>{m.who==='assistant'&&<span className={s.agentName}>ATM Agent</span>}<p>{m.text}</p>{m.reply&&<ReplyDetails reply={m.reply}/>}</div>{m.at&&<time className={s.time} dateTime={m.at}>{time(m.at)}</time>}</div>
    </div>)}{busy&&<div className={s.message} role="status" aria-label="ATM Agent sedang memeriksa"><span className={s.avatar}><Icon name="chat" size={14}/></span><div className={s.bubble}><span className={s.typing}><span/><span/><span/></span></div></div>}</div>
     {messages.length===1&&messages[0].id==='welcome'&&!busy&&<div className={s.suggestions}>{suggestions.map(([label,prompt])=><button key={label} type="button" className={s.suggestion} onClick={()=>void send(prompt)}>{label}<Icon name="arrow" size={12}/></button>)}</div>}
    </>}
    {tab==='help'&&<><h3 className={s.sectionTitle}>Pusat bantuan</h3><p className={s.sectionHint}>Temukan panduan yang Anda butuhkan.</p><label className={s.search}><Icon name="search"/><input aria-label="Cari panduan" placeholder="Cari panduan…" value={search} onChange={e=>setSearch(e.target.value)}/></label>{filteredHelp.map(h=><div key={h.topic} className={s.article}><button type="button" className={s.articleButton} aria-expanded={article===h.topic} aria-controls={'help-'+h.topic} onClick={()=>setArticle(article===h.topic?undefined:h.topic)}>{titles[h.topic]??h.topic}<Icon name="down" size={13}/></button>{article===h.topic&&<div id={'help-'+h.topic} className={s.articleAnswer}><p>{h.text}</p><div className={s.articleActions}>{safePath(h.path)&&<Link href={h.path} className={s.link}>Buka halaman <Icon name="arrow" size={12}/></Link>}<button type="button" disabled={busy} className={s.ask} onClick={()=>{setTab('chat');setInput('Saya perlu bantuan tentang '+(titles[h.topic]??h.topic).toLowerCase())}}>Tanyakan ke ATM Agent</button></div></div>}</div>)}{filteredHelp.length===0&&<div className={s.empty}><Icon name="search" size={25}/><strong>Panduan tidak ditemukan</strong><p>Coba kata kunci lain.</p></div>}</>}
    {tab==='history'&&<><h3 className={s.sectionTitle}>Percakapan Anda</h3><p className={s.sectionHint}>Buka kembali obrolan sebelumnya.</p>{historyError&&<div className={s.error}>{historyError}<div><button type="button" className={`${s.secondary} ${s.retry}`} onClick={()=>void loadHistory()}>Coba lagi</button></div></div>}{historyLoading?<div role="status" className={s.historyLoading}>Memuat percakapan…</div>:!historyError&&threads.length===0?<div className={s.empty}><Icon name="history" size={30}/><strong>Belum ada percakapan</strong><p>Mulai chat pertama bersama ATM Agent.</p><button type="button" className={`${s.primary} ${s.retry}`} onClick={newChat}>Mulai chat</button></div>:!historyError&&threads.map(t=><button key={t.id} type="button" disabled={busy} className={s.historyItem} onClick={()=>void openThread(t)} aria-label={'Buka percakapan '+t.title}><span className={s.historyIcon}><Icon name="chat" size={15}/></span><span className={s.historyDetails}><span className={s.historyTitle}>{t.title}</span><span className={s.historyPreview}>{t.last_preview||'Percakapan baru'}</span><time className={s.historyDate} dateTime={t.updated_at}>{date(t.updated_at)}</time></span><Icon name="arrow" size={13}/></button>)}</>}
   </div>
   {tab==='chat'&&<div className={s.bottom}>{pending&&<div className={s.confirmation}><p className={s.confirmText}>Simpan perubahan ini?</p><button disabled={busy} type="button" className={s.primary} onClick={()=>void send('YA')}>Konfirmasi</button><button disabled={busy} type="button" className={s.secondary} onClick={()=>void send('BATAL')}>Batal</button></div>}<form className={s.composer} onSubmit={e=>{e.preventDefault();void send(input)}}><label htmlFor="atm-agent-message" className="sr-only">Pesan untuk asisten</label><textarea id="atm-agent-message" ref={field} value={input} maxLength={3000} rows={1} placeholder="Tulis pesan Anda…" onChange={e=>{setInput(e.target.value);e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,110)+'px'}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send(input)}}}/><button type="submit" className={s.send} disabled={busy||!input.trim()} aria-label="Kirim"><Icon name="send" size={17}/></button></form></div>}
  </section>}
 </>
}
