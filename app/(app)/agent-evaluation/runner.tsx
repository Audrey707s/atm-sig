'use client'
import {useEffect,useRef,useState,useSyncExternalStore} from 'react'
import cases from '@/docs/agent-v2/conversation-uat.json'
type Result={id:string;status:string;reason:string;actual?:unknown;model?:string;usage?:{input:number;output:number}}
const cacheKey='atm-agent-planning-evaluation-v1'
const subscribe=()=>()=>{}
function restored(raw:string):Result[]{try{const value=JSON.parse(raw);return Array.isArray(value)?value:[]}catch{return []}}
export default function Runner(){
 const cached=useSyncExternalStore(subscribe,()=>sessionStorage.getItem(cacheKey)??'[]',()=>'[]')
 const [latest,setResults]=useState<Result[]|null>(null),[running,setRunning]=useState(false),[status,setStatus]=useState('Siap'),[current,setCurrent]=useState('')
 const results=latest??restored(cached)
 const stop=useRef(true),request=useRef<AbortController|null>(null)
 useEffect(()=>()=>{stop.current=true;request.current?.abort()},[])
 async function run(){
  if(running)return
  stop.current=false;setRunning(true);let accumulated=[...results]
  try{
   for(const test of cases){
    if(accumulated.some(r=>r.id===test.id))continue
    if(stop.current)break
    setCurrent(test.id+' · '+test.roleName+' · '+test.messages[0]);setStatus('Mengevaluasi model; tidak menjalankan perubahan data')
    let result:Result|undefined
    for(let attempt=0;attempt<3&&!stop.current;attempt++){
     const controller=new AbortController();request.current=controller
     const response=await fetch('/api/assistant/evaluation',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({caseId:test.id}),signal:controller.signal})
     const body=await response.json()
     if(response.ok){result=body;break}
     if(response.status!==429)throw new Error(body.reason??'Evaluasi tidak tersedia.')
     setStatus('Kuota gratis sementara terbatas; menunggu 60 detik sebelum mencoba kembali.')
     await pause(60000)
    }
    if(stop.current)break
    if(!result)throw new Error('Evaluasi dihentikan karena kuota gratis belum tersedia. Hasil sebelumnya tetap tersimpan.')
    accumulated=[...accumulated,result];setResults(accumulated);sessionStorage.setItem(cacheKey,JSON.stringify(accumulated))
    setStatus('Menunggu giliran berikutnya agar tetap dalam kuota gratis.');await pause(45000)
   }
   if(!stop.current)setStatus('Evaluasi selesai. Kasus FAIL dan REVIEW perlu ditinjau; ini bukan bukti eksekusi CRUD.')
  }catch(error){if(!stop.current)setStatus(error instanceof Error?error.message:'Evaluasi terhenti.')}finally{setRunning(false);request.current=null}
 }
 async function pause(ms:number){for(let elapsed=0;elapsed<ms&&!stop.current;elapsed+=1000)await new Promise(resolve=>setTimeout(resolve,1000))}
 function halt(){stop.current=true;request.current?.abort();setStatus('Dihentikan. Hasil yang selesai tetap tersimpan.')}
 return <section style={{maxWidth:1000,margin:'0 auto',padding:24}}><h1>Evaluasi ATM Agent · Preview</h1><p>120 skenario sintetis untuk enam role. Menguji perencanaan model asli tanpa mengubah tugas, mengirim notifikasi, atau menjalankan CRUD.</p><p>Hasil ini terpisah dari pengujian izin database dan WhatsApp langsung. PASS berarti isian rencana cocok; REVIEW membutuhkan pemeriksaan manusia.</p><button type="button" onClick={()=>void run()} disabled={running}>Mulai / lanjutkan evaluasi</button>{' '}<button type="button" onClick={halt} disabled={!running}>Hentikan</button><p role="status">{status}</p><p>{current}</p><p><strong>{results.length} / {cases.length}</strong> · PASS {results.filter(r=>r.status==='PASS').length} · FAIL {results.filter(r=>r.status==='FAIL').length} · REVIEW {results.filter(r=>r.status==='REVIEW').length}</p><progress value={results.length} max={cases.length} style={{width:'100%'}}/><table><thead><tr><th>Kasus</th><th>Hasil</th><th>Catatan</th></tr></thead><tbody>{results.map(r=><tr key={r.id}><td>{r.id}</td><td>{r.status}</td><td><details><summary>{r.reason}</summary><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(r.actual,null,2)}</pre></details></td></tr>)}</tbody></table></section>
}
