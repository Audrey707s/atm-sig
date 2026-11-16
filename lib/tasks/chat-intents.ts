/** Common read requests do not depend on a model or its quota. */
export function taskReadIntent(message: string): {mode:'list'|'mine'|'review';query:string} | null {
  const text=message.trim().replace(/[.!?]+$/,'').replace(/\s+/g,' ')
    .replace(/^(?:tolong|mohon|boleh|bisa)(?:\s+(?:kamu|anda))?\s+/i,'')
  const prefix='(?:(?:lihat|liat|tampilkan|tunjukkan|tunjukin|cek|buka)\\s+)?'
  if(new RegExp('^'+prefix+'(?:(?:list|daftar)\\s+)?(?:tugas|task|tasks|pekerjaan)\\s+(?:yang\\s+)?(?:(?:perlu|harus|untuk|menunggu)\\s+)?(?:saya\\s+)?(?:review|tinjau|ditinjau|direview)(?:\\s+saya)?$','i').test(text)
    || /^(?:lihat |list |daftar )?(?:review|tinjauan)(?: tugas)?(?: saya)?$/i.test(text)) return {mode:'review',query:''}
  if(new RegExp('^'+prefix+'(?:(?:list|daftar)\\s+)?(?:semua\\s+)?(?:tugas|task|tasks|pekerjaan)(?:\\s+(?:saya|aku|pribadi|tim|semua|yang ditugaskan kepada saya))?$','i').test(text))
    return {mode:/\b(saya|aku|pribadi)\b/i.test(text)?'mine':'list',query:''}
  const details=/^(?:(?:lihat|buka|cek)\s+)?detail(?:\s+tugas)?\s+([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.exec(text)
  if(details)return {mode:'list',query:details[1].toLowerCase()}
  const search=/^(?:cari|carikan)\s+(?:tugas|task|pekerjaan)\s+(.+)$/i.exec(text)
  if(search)return {mode:'list',query:search[1].replace(/^["“]|["”]$/g,'').trim()}
  return null
}
