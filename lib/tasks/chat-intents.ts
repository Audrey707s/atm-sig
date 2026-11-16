/** Common read requests do not depend on a model or its quota. */
export function taskReadIntent(message: string): {mode:'list'|'mine'|'review'|'mine_open'|'open';query:string;page?:string;pic?:string} | null {
  const text=message.trim().replace(/[.!?]+$/,'').replace(/\s+/g,' ')
    .replace(/^(?:tolong|mohon|boleh|bisa)(?:\s+(?:kamu|anda))?\s+/i,'')
  const paged=/^(.*?)\s+(?:halaman|page)\s+([1-9]\d{0,3})$/i.exec(text)
  if(paged){const intent=taskReadIntent(paged[1]);return intent?{...intent,page:paged[2]}:null}
  const open=/\s+(?:yang\s+)?(?:masih\s+)?(?:open|aktif|belum selesai|belum beres|belum kelar)$/i.exec(text)
  if(open){const intent=taskReadIntent(text.slice(0,open.index));return intent&&intent.mode!=='review'?{...intent,mode:intent.mode==='mine'?'mine_open':'open'}:null}
  const prefix='(?:(?:lihat|liat|tampilkan|tunjukkan|tunjukin|cek|buka)\\s+)?'
  if(new RegExp('^'+prefix+'(?:(?:list|daftar)\\s+)?(?:tugas|task|tasks|pekerjaan)\\s+(?:yang\\s+)?(?:(?:perlu|harus|untuk|menunggu)\\s+)?(?:saya\\s+)?(?:review|tinjau|ditinjau|direview)(?:\\s+saya)?$','i').test(text)
    || /^(?:lihat |list |daftar )?(?:review|tinjauan)(?: tugas)?(?: saya)?$/i.test(text)) return {mode:'review',query:''}
  if(new RegExp('^'+prefix+'(?:(?:list|daftar)\\s+)?(?:semua\\s+)?(?:tugas|task|tasks|pekerjaan)(?:\\s+(?:saya|aku|pribadi|tim|semua|yang ditugaskan kepada saya))?$','i').test(text))
    return {mode:/\b(saya|aku|pribadi)\b/i.test(text)?'mine':'list',query:''}
  const details=/^(?:(?:lihat|buka|cek)\s+)?detail(?:\s+tugas)?\s+([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.exec(text)
  if(details)return {mode:'list',query:details[1].toLowerCase()}
  const owner=/^(?:(?:lihat|liat|tampilkan|cek|cari|carikan)\s+)?(?:(?:daftar|list)\s+)?(?:tugas|task|pekerjaan)\s+(?:milik|punya|pic|untuk|yang dikerjakan oleh)\s+(.+)$/i.exec(text)
  if(owner)return {mode:'list',query:'',pic:normalizeTaskReference(owner[1]).text}
  const search=/^(?:cari|carikan|lihat|tampilkan|cek)\s+(?:(?:daftar|list)\s+)?(?:tugas|task|pekerjaan)\s+(.+)$/i.exec(text)
  if(search){const reference=normalizeTaskReference(search[1]);return {mode:'list',query:reference.text,...(!/^(?:cari|carikan)\b/i.test(text)&&!reference.exact?{pic:reference.text}:{})}}
  return null
}

/** Politeness belongs to the request; words inside explicit quotes belong to the title. */
export function normalizeTaskReference(value:string):{text:string;exact:boolean} {
 const text=value.trim().replace(/[.!?]+$/,'').trim()
 const quoted=/^["“”'](.+?)["“”'](?:\s+(?:ya|dong|deh|tolong|please))*$/i.exec(text)
 if(quoted)return {text:quoted[1].trim(),exact:true}
 return {text:text.replace(/\s+(?:ya|dong|deh|tolong|please)$/i,'').trim(),exact:false}
}
