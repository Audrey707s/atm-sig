'use client'
import Link from 'next/link'
import { useEffect,useRef,useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AssistantReply } from '@/lib/ai/contracts'
type Message={id:number;who:'user'|'assistant';text:string;reply?:AssistantReply}
const welcome:Message={id:0,who:'assistant',text:'Halo! Saya bisa membantu mencari tugas, menjelaskan fitur, dan menyiapkan perubahan sesuai akses Anda. Apa yang ingin dikerjakan?'}
function safePath(path?:string) {return path&&/^\/(?!\/)[a-z0-9/_?=&%-]*$/i.test(path)?path:undefined}
export default function AssistantWidget() {
 const [open,setOpen]=useState(false),[messages,setMessages]=useState<Message[]>([welcome]),[input,setInput]=useState(''),[busy,setBusy]=useState(false),[pending,setPending]=useState<string>(),[position,setPosition]=useState({right:20,bottom:80})
 const drag=useRef<{x:number;y:number;right:number;bottom:number;moved:boolean}|null>(null),moved=useRef(false),launcher=useRef<HTMLButtonElement>(null),field=useRef<HTMLTextAreaElement>(null),end=useRef<HTMLDivElement>(null),seq=useRef(1),abort=useRef<AbortController|null>(null)
 const router=useRouter()
 useEffect(()=>{if(open){field.current?.focus();end.current?.scrollIntoView({block:'nearest'})}},[open,messages,busy])
 useEffect(()=>{
  const resize=()=>setPosition(p=>({right:Math.min(Math.max(12,p.right),Math.max(12,window.innerWidth-68)),bottom:Math.min(Math.max(20,p.bottom),Math.max(20,window.innerHeight-68))}))
  window.addEventListener('resize',resize);return()=>{window.removeEventListener('resize',resize);abort.current?.abort()}
 },[])
 function close(){setOpen(false);launcher.current?.focus()}
 async function send(text:string) {
  if(busy||!text.trim())return
  const confirmation=/^(ya|konfirmasi)$/i.test(text.trim()),token=confirmation?pending:undefined
  setMessages(ms=>[...ms.slice(-29),{id:seq.current++,who:'user',text}]);setInput('');setBusy(true);setPending(undefined)
  const controller=new AbortController();abort.current=controller;const timer=setTimeout(()=>controller.abort(),25000)
  try {
   const response=await fetch('/api/assistant',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text,token}),signal:controller.signal})
   if(response.status===401){router.push('/login');return}
   if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('Invalid response')
   const reply=await response.json() as AssistantReply
   setMessages(ms=>[...ms,{id:seq.current++,who:'assistant',text:reply.message,reply}]);setPending(reply.pending?reply.token:undefined)
   if(reply.changed)router.refresh()
  }catch{setMessages(ms=>[...ms,{id:seq.current++,who:'assistant',text:'Balasan belum diterima. Periksa halaman terkait sebelum mengulangi perubahan.'}])}
  finally{clearTimeout(timer);setBusy(false);abort.current=null}
 }
 return <>
  <button ref={launcher} type="button" aria-label={open?'Tutup Asisten ATM':'Buka Asisten ATM'} aria-expanded={open} aria-controls="atm-assistant" title="Asisten ATM — geser untuk memindahkan" className="fixed z-40 flex h-14 w-14 touch-none items-center justify-center rounded-full bg-[#EB232D] text-white shadow-lg outline-offset-4 focus-visible:outline-2 focus-visible:outline-red-700" style={{right:position.right,bottom:position.bottom}}
   onPointerDown={e=>{if(e.button!==0)return;drag.current={x:e.clientX,y:e.clientY,...position,moved:false};moved.current=false;e.currentTarget.setPointerCapture(e.pointerId)}}
   onPointerMove={e=>{const d=drag.current;if(!d)return;if(Math.abs(e.clientX-d.x)+Math.abs(e.clientY-d.y)>6){d.moved=true;moved.current=true;setPosition({right:Math.min(Math.max(12,d.right+d.x-e.clientX),window.innerWidth-68),bottom:Math.min(Math.max(20,d.bottom+d.y-e.clientY),window.innerHeight-68)})}}}
   onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null;moved.current=true}}
   onKeyDown={e=>{const directions:Record<string,[number,number]>={ArrowLeft:[20,0],ArrowRight:[-20,0],ArrowUp:[0,20],ArrowDown:[0,-20]};const v=directions[e.key];if(v){e.preventDefault();setPosition(p=>({right:Math.min(Math.max(12,p.right+v[0]),window.innerWidth-68),bottom:Math.min(Math.max(20,p.bottom+v[1]),window.innerHeight-68)}))}}}
   onClick={()=>{if(!moved.current)setOpen(o=>!o);moved.current=false}}>
   <svg aria-hidden="true" width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M20 11.5a8 8 0 0 1-8 8H5l-3 2v-10a9 9 0 0 1 18 0Z"/><path d="M8 10h.01M12 10h.01M16 10h.01M8 14h8" strokeLinecap="round"/></svg>
  </button>
  {open&&<section id="atm-assistant" role="dialog" aria-label="Asisten ATM" onKeyDown={e=>{if(e.key==='Escape')close()}} className="fixed right-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 flex h-[min(600px,calc(100dvh-6rem))] w-[min(390px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white text-gray-900 shadow-2xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
   <header className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700"><div><p className="text-base font-bold">Asisten <span className="text-[#EB232D]">ATM</span></p><p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Bantuan & pekerjaan Anda</p></div><button type="button" aria-label="Tutup chat" onClick={close} className="rounded-lg px-3 py-2 text-xl hover:bg-gray-100 dark:hover:bg-gray-800">×</button></header>
   <div role="log" aria-live="polite" aria-relevant="additions" className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
    {messages.map(m=><div key={m.id} className={m.who==='user'?'ml-8 rounded-2xl rounded-br-sm bg-red-50 px-4 py-3 text-sm dark:bg-red-950':'mr-3 rounded-2xl rounded-bl-sm bg-gray-50 px-4 py-3 text-sm dark:bg-gray-800'}>
     <p className="whitespace-pre-wrap break-words leading-relaxed">{m.text}</p>
     {Array.isArray(m.reply?.rows)&&<div className="mt-3 space-y-3">{m.reply.rows.slice(0,20).map((r,i)=><div key={String(r.id??i)} className="border-t border-gray-200 pt-2 dark:border-gray-600"><p className="font-medium">{String(r.title??r.label??'Data')}</p><p className="mt-1 text-xs">{String(r.status??r.details??'')}{r.due?' · '+String(r.due)+' WIB':''}</p>{Boolean(r.id)&&<p className="mt-1 break-all text-[11px] text-gray-500 dark:text-gray-400">ID: {String(r.id)}</p>}{Boolean(r.title&&r.id)&&<Link href={'/tasks/'+String(r.id)} className="mt-1 inline-block font-medium text-red-600 dark:text-red-400">Lihat tugas ↗</Link>}</div>)}{m.reply.rows.length===0&&<p>Tidak ada hasil.</p>}</div>}
     {m.reply?.rows&&!Array.isArray(m.reply.rows)&&<dl className="mt-3 grid grid-cols-2 gap-2">{Object.entries(m.reply.rows).map(([k,v])=><div key={k}><dt className="text-xs text-gray-500">{({total:'Total',done:'Selesai',review:'Review',overdue:'Lewat tenggat'} as Record<string,string>)[k]??k}</dt><dd className="font-semibold">{String(v)}</dd></div>)}</dl>}
     {safePath(m.reply?.path)&&<Link href={safePath(m.reply?.path)!} className="mt-3 inline-block font-semibold text-red-600 dark:text-red-400">Buka halaman terkait ↗</Link>}
    </div>)}
    {busy&&<p role="status" className="px-2 text-sm text-gray-500">Sedang memeriksa…</p>}<div ref={end}/>
   </div>
   {pending&&<div className="flex gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-700"><button disabled={busy} type="button" onClick={()=>void send('YA')} className="flex-1 rounded-lg bg-[#EB232D] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Konfirmasi</button><button disabled={busy} type="button" onClick={()=>void send('BATAL')} className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">Batal</button></div>}
   <form onSubmit={e=>{e.preventDefault();void send(input)}} className="flex items-end gap-2 border-t border-gray-200 p-3 dark:border-gray-700"><label htmlFor="atm-assistant-message" className="sr-only">Pesan untuk asisten</label><textarea id="atm-assistant-message" ref={field} value={input} onChange={e=>setInput(e.target.value)} maxLength={3000} rows={2} placeholder="Contoh: lihat tugas saya" onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send(input)}}} className="min-w-0 flex-1 resize-none rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm outline-offset-2 dark:border-gray-600"/><button type="submit" disabled={busy||!input.trim()} className="rounded-lg bg-[#EB232D] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">Kirim</button></form>
  </section>}
 </>
}
