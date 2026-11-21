/** Common read requests do not depend on a model or its quota. */
export function taskReadIntent(message: string): {mode:'list'|'mine'|'review'|'mine_open'|'open'|'report'|'calendar';query:string;page?:string;pic?:string} | null {
  const text=message.trim().replace(/\s+(?:apa saja|apasaja|saja|dong|ya)$/i,'').replace(/[.!?]+$/,'').replace(/\s+/g,' ')
    .replace(/^(?:tolong|mohon|boleh|bisa)(?:\s+(?:kamu|anda))?\s+/i,'')
  if(/^(?:(?:lihat|liat|tampilkan|tunjukkan|cek|buka)\s+)?(?:yang\s+)?(?:perlu|harus|untuk)\s+saya\s+(?:tinjau|review|ditinjau|direview)$/i.test(text))return {mode:'review',query:''}
  if(/^(?:ringkas(?:kan|in)?|rekap(?:kan)?|rangkum(?:kan)?|laporan)\s+(?:tugas|task|kerjaan|pekerjaan)\s+(?:saya|aku)$/i.test(text))return {mode:'report',query:''}
  if(/^(?:(?:apa aja|apa saja|apa)\s+)?(?:tenggat|deadline)(?:\s+(?:tugas|task))?\s+(?:minggu ini|7 hari(?: ke depan)?)(?:\s+(?:saya|aku))?$/i.test(text))return {mode:'calendar',query:''}
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
  const search=/^(?:cari|carikan|lihat|liat|tampilkan|tunjukkan|tunjukin|cek|buka|bukain)\s+(?:(?:daftar|list)\s+)?(?:tugas|task|pekerjaan)\s+(.+)$/i.exec(text)
  if(search){const scoped=taskMutationReference(search[1]);if(scoped.pic)return {mode:'list',query:scoped.target,pic:scoped.pic};const reference=normalizeTaskReference(search[1]);return {mode:'list',query:reference.text,...(!/^(?:cari|carikan)\b/i.test(text)&&!reference.exact?{pic:reference.text}:{})}}
  return null
}

/** Politeness belongs to the request; words inside explicit quotes belong to the title. */
export function normalizeTaskReference(value:string):{text:string;exact:boolean} {
 const text=value.trim().replace(/[.!?]+$/,'').trim()
 const quoted=/^["“”'](.+?)["“”'](?:\s+(?:ya|dong|deh|tolong|please))*$/i.exec(text)
 if(quoted)return {text:quoted[1].trim(),exact:true}
 return {text:text.replace(/\s+(?:ya|dong|tolong|please)$/i,'').trim(),exact:false}
}

export function taskMutationReference(value:string):{target:string;exact:boolean;pic?:string;context?:boolean} {
 const text=value.trim().replace(/[.!?]+$/,'').trim()
 const labeled=/^(?:judul|nama(?: tugas| task)?)\s*:\s*(.+?)\s*[,;\n]\s*(?:pic|penanggung jawab)(?:\s*-?\s*nya)?\s*:?\s*(.+)$/i.exec(text)
 const reversed=/^(?:pic|penanggung jawab)(?:\s*-?\s*nya)?\s*:?\s*(.+?)\s*[,;\n]\s*(?:judul|nama(?: tugas| task)?)\s*:\s*(.+)$/i.exec(text)
 if(labeled||reversed){const title=normalizeTaskReference(labeled?labeled[1]:reversed![2]);return {target:title.text,exact:title.exact,pic:ownerName(labeled?labeled[2]:reversed![1])}}
 const ownerFirst=/^(?:(?:milik|punya|pic)\s+)?(.+?)\s+(?:dengan\s+(?:nama|judul)|(?:yang\s+)?berjudul|bernama)\s+(.+)$/i.exec(text)
 if(ownerFirst){const title=normalizeTaskReference(ownerFirst[2]);return {target:title.text,exact:title.exact,pic:ownerName(ownerFirst[1])}}
 const quoted=/^["“”'](.+?)["“”'](?:\s+(?:milik|punya|punyanya|pic|oleh)\s+(.+?))?(?:\s+(?:ya|dong|deh|tolong|please))*$/i.exec(text)
 if(quoted)return {target:quoted[1].trim(),exact:true,...(quoted[2]?{pic:ownerName(quoted[2])}:{})}
 const unmarked=/^[\"“”'](.+?)[\"“”']\s+(.+)$/i.exec(text)
 if(unmarked)return {target:unmarked[1].trim(),exact:true,pic:ownerName(unmarked[2])}
 const owned=/^(.+?)\s+(?:milik|punya|punyanya|pic|oleh)\s+(.+)$/i.exec(text)
 if(owned){const title=normalizeTaskReference(owned[1]);if(!title.exact)title.text=owned[1].trim();return {target:title.text,exact:title.exact,pic:ownerName(owned[2])}}
 const reference=normalizeTaskReference(text)
 return {target:reference.text,exact:reference.exact,...(/^(?:ya|dong|deh|itu|ini|tersebut|yang tadi|yang dipilih|terpilih)$/i.test(reference.text)?{context:true}:{})}
}

function ownerName(text:string){return normalizeTaskReference(text.trim().replace(/^(?:pic|penanggung jawab)(?:\s*-?\s*nya)?\s*:?\s+/i,'')).text}
