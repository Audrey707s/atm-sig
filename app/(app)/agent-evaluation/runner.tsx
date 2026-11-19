'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import fixtures from '@/docs/agent-v2/conversation-uat.json'
import s from './runner.module.css'
type Result={id:string;status:string;reason:string;revision:string;actual?:unknown;model?:string;usage?:{input:number;output:number};finishedAt?:string}
type Entry={id:string;state:string;attempts:number;lastAttempt?:string;leaseUntil?:string;result:Result|null}
type Run={id:string;revision:string;status:string;reason:string;next_at:string;updated_at:string;created_at:string}
type Snapshot={run:Run|null;results:Entry[];workerLastSeen?:string;serverTime?:string}
const labels:Record<string,string>={queued:'Dalam antrean server',running:'Sedang diproses server',waiting:'Menunggu percobaan ulang otomatis',paused:'Dijeda',completed:'Evaluasi selesai',completed_with_errors:'Selesai dengan error layanan',canceled:'Dibatalkan'}
const date=(value?:string)=>value?new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'medium'}).format(new Date(value))+' WIB':'Belum tersedia'
async function readResponse(response:Response){
 const body=await response.json().catch(()=>null)
 if(!response.ok)throw new Error(response.status===401?'Sesi masuk berakhir. Login kembali; pekerjaan server tetap tersimpan.':body?.error??'Server belum dapat dihubungi. Progres tidak dihapus.')
 return body as Snapshot
}
export default function Runner({revision}:{revision:string}){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[checking,setChecking]=useState(true)
 const pending=useRef(false)
 const refresh=useCallback(async(signal?:AbortSignal)=>{
  if(pending.current)return
  pending.current=true
  try{const result=await readResponse(await fetch('/api/assistant/evaluation',{credentials:'same-origin',cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)}));if(!signal?.aborted){setSnapshot(result);setError('')}}
  catch(error){if(!signal?.aborted)setError(error instanceof Error?error.message:'Gagal memuat progres.')}
  finally{pending.current=false;if(!signal?.aborted)setChecking(false)}
 },[])
 useEffect(()=>{
  const controller=new AbortController();const initial=setTimeout(()=>void refresh(controller.signal),0)
  const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh()},10000)
  const visible=()=>{if(document.visibilityState==='visible')void refresh()}
  document.addEventListener('visibilitychange',visible)
  return()=>{controller.abort();clearTimeout(initial);clearInterval(timer);document.removeEventListener('visibilitychange',visible)}
 },[refresh])
 async function command(action:string){
  if(busy)return
  setBusy(true);setError('')
  try{setSnapshot(await readResponse(await fetch('/api/assistant/evaluation',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,runId:action==='new'?undefined:snapshot?.run?.id}),signal:AbortSignal.timeout(20000)})))}
  catch(error){setError(error instanceof Error?error.message:'Perintah belum tersimpan.')}
  finally{setBusy(false)}
 }
 const run=snapshot?.run,entries=snapshot?.results??[],done=entries.filter(x=>x.state==='done'),active=!!run&&['queued','running','waiting'].includes(run.status),same=run?.revision===revision
 const count=(status:string)=>done.filter(x=>x.result?.status===status).length
 const casesById=new Map(fixtures.map(f=>[f.id,f]))
 const stale=active&&snapshot?.serverTime&&new Date(run!.next_at).getTime()<=new Date(snapshot.serverTime).getTime()&&new Date(snapshot.serverTime).getTime()-new Date(snapshot.workerLastSeen??run!.created_at).getTime()>180000
 return <section className={s.page}>
  <header className={s.header}><span className={s.eyebrow}>PREVIEW · EVALUASI</span><h1>Evaluasi ATM Agent</h1><p>120 skenario sintetis untuk enam role. Proses berjalan di server; tab ini boleh ditutup dan dibuka kembali.</p></header>
  <div className={s.panel}>
   <div className={s.toolbar}><button className={s.primary} type="button" disabled={busy||checking||!!active&&same} onClick={()=>void command(!run?'start':!same||run.status==='completed'||run.status==='completed_with_errors'?'new':'resume')}>{busy?'Menyimpan…':active&&same?'Berjalan di server':!run?'Mulai evaluasi':!same||['completed','completed_with_errors'].includes(run.status)?'Mulai evaluasi baru':'Lanjutkan evaluasi'}</button><button className={s.secondary} type="button" disabled={busy||!active} onClick={()=>void command('pause')}>Jeda evaluasi</button><button className={s.secondary} type="button" disabled={busy} onClick={()=>void refresh()}>Perbarui progres</button>{same&&!active&&(count('FAIL')+count('ERROR')>0)&&<button className={s.secondary} type="button" disabled={busy} onClick={()=>void command('retry')}>Uji ulang kasus gagal / error</button>}</div>
   <div role="status" className={s.status}><strong>{checking?'Memuat progres server…':run?labels[run.status]??run.status:'Siap memulai'}</strong><span>{run?.reason||'Pengujian ini tidak mengubah tugas, menjalankan CRUD, atau mengirim notifikasi.'}</span></div>
   {error&&<p role="alert" className={s.error}>{error}</p>}
   {stale&&<p role="alert" className={s.error}>Pekerja server belum merespons lebih dari tiga menit. Progres tetap tersimpan; status ini tidak dianggap sedang berjalan normal.</p>}
   {run?.status==='waiting'&&<p className={s.notice}>Percobaan ulang otomatis: <strong>{date(run.next_at)}</strong>. Tidak perlu menekan Mulai berulang kali.</p>}
   {!!run&&!same&&<p className={s.notice}>Hasil ini berasal dari versi sebelumnya. Mulai evaluasi baru agar versi tidak tercampur. Hasil lama tetap tersimpan di server.</p>}
   <div className={s.metrics}>{[['Selesai',done.length+'/'+(entries.length||120)],['PASS',count('PASS')],['FAIL',count('FAIL')],['REVIEW',count('REVIEW')],['ERROR layanan',count('ERROR')]].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
   <progress aria-label="Progres evaluasi" className={s.progress} value={done.length} max={entries.length||120}/>
   <dl className={s.meta}><div><dt>Versi hasil</dt><dd>{run?.revision.slice(0,7)??'Belum ada evaluasi server'}</dd></div><div><dt>Pembaruan terakhir</dt><dd>{date(run?.updated_at)}</dd></div><div><dt>Worker terakhir merespons</dt><dd>{date(snapshot?.workerLastSeen)}</dd></div></dl>
  </div>
  <p className={s.explanation}>PASS hanya menilai rencana model pada skenario sintetis. Pengujian izin database, eksekusi CRUD, dan WhatsApp langsung dinilai terpisah. ERROR layanan bukan kegagalan memahami bahasa dan tidak dihitung sebagai PASS.</p>
  <div className={s.tableWrap}><table className={s.table}><thead><tr><th>Kasus / role</th><th>Status</th><th>Percobaan</th><th>Hasil / keterangan</th></tr></thead><tbody>{entries.length?entries.map(entry=><tr key={entry.id}><td><strong>{entry.id}</strong><span className={s.sub}>{casesById.get(entry.id)?.roleName??''}</span></td><td><span className={s.badge}>{entry.result?.status??({pending:'Antrean',processing:'Memproses',retry:'Menunggu retry'}[entry.state]??entry.state)}</span></td><td>{entry.attempts}</td><td>{entry.result?<details><summary>{entry.result.reason}</summary><pre>{JSON.stringify(entry.result,null,2)}</pre></details>:entry.state==='processing'?'Batas kerja: '+date(entry.leaseUntil):'Menunggu giliran server'}</td></tr>):<tr><td colSpan={4} className={s.empty}>Belum ada pekerjaan server. Klik Mulai evaluasi untuk menjalankan pengujian.</td></tr>}</tbody></table></div>
  <details className={s.export}><summary>Hasil JSON untuk ditinjau</summary><textarea aria-label="Hasil evaluasi JSON" readOnly value={JSON.stringify(snapshot,null,2)} rows={12}/></details>
  <p className={s.explanation}>Hasil browser dari evaluator lama tidak digabungkan ke run server karena versi dan kelengkapannya belum terverifikasi. Penyimpanan sesi lama tidak dihapus oleh halaman ini.</p>
 </section>
}
