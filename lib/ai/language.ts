import type {Plan} from './contracts'
import {normalizeTaskReference,taskMutationReference} from '@/lib/tasks/chat-intents'
/** Normalize request words only; quoted titles and values are never rewritten. */
export function requestLanguage(message:string):string {
 const text=message.trim()
  .replace(/^(?:(?:eh|nah|dong|tolong|mohon|bantu|coba|bisa|boleh|loh|oh|oke|silakan|silahkan)(?:\s+(?:saya|kamu|anda))?\s+|(?:saya\s+)?(?:mau|ingin|pengen)\s+)+/i,'')
  .replace(/\s+(?:ya|dong|deh|please|tolong)(?:[.!?]*)$/i,'').replace(/[.!?]+$/,'').trim()
 // Only the initial command is normalized. Unquoted titles/names remain literal too.
 const aliases:Record<string,string>={ngeliat:'lihat',ngeliatin:'lihat',lihatin:'lihat',liatin:'lihat',tengok:'lihat',tunjukin:'lihat',tunjukkin:'lihat',bukain:'lihat',bikinin:'buatkan',buatin:'buatkan',bikin:'buatkan',membuat:'buatkan',menambahkan:'tambahkan',nambahin:'tambahkan',hapuskan:'hapus',hapusin:'hapus',apusin:'hapus',deletein:'hapus',hilangkan:'hapus',menghapus:'hapus',gantiin:'ubah',ubahin:'ubah',editin:'ubah',ngubah:'ubah',mengubah:'ubah',pindahin:'pindahkan',geserin:'pindahkan',geser:'pindahkan',pindah:'pindahkan',memindahkan:'pindahkan'}
 return text.replace(/^([^\s]+)\b/,word=>aliases[word.toLowerCase()]??word)
}
function named(text:string){return normalizeTaskReference(text).text}
function mutate(operation:string,target:string,data:Record<string,string>={}):Plan {
 const reference=taskMutationReference(target.replace(/^(?:tugas|task)(?:\s+berjudul)?\s+/i,''))
 return {kind:'propose',operation,...reference,target:reference.context?undefined:reference.target,context:!target||reference.context,data}
}
const statuses:Record<string,string>={'to do':'To do','belum dimulai':'To do',belum:'To do',berjalan:'In progress',dikerjakan:'In progress','in progress':'In progress','on progress':'In progress','lagi dikerjain':'In progress','sedang dikerjakan':'In progress',ditunda:'Blocked',terhambat:'Blocked',tertunda:'Blocked',blocked:'Blocked',review:'Review','menunggu tinjauan':'Review','menunggu review':'Review',selesai:'Done',beres:'Done',kelar:'Done',done:'Done'}
export function statusValue(value:string){return statuses[value.trim().toLowerCase()]}
/** Additional deterministic intents cover the entire operation catalogue. */
export function featurePlan(text:string):Plan|null {
 let m:RegExpExecArray|null
 m=/^(?:pic|penanggung jawab)\s+(?:tugas|task)\s+(.+?)\s+(?:diganti|diubah|dipindahkan)(?:\s+(?:menjadi|jadi|ke))?\s+(.+)$/i.exec(text)
 if(m)return mutate('task_reassign',m[1],{pic:named(m[2])})
 m=/^(?:tugas|task)\s+(.+?)\s+(?:tolong\s+)?(?:hapus|delete)$/i.exec(text)
 if(m)return mutate('task_delete',m[1])
 // Passive requests are anchored to the operation, never inferred from a title alone.
 m=/^(?:tugas|task)\s+(.+?)\s+(?:tolong\s+)?(?:dihapus|dihapusin|dibuang)$/i.exec(text)
 if(m)return mutate('task_delete',m[1])
 m=/^(?:tugas|task)\s+(.+?)\s+(?:tolong\s+)?(?:dipindahkan|dipindahin|dialihkan|digeser|digeserin)\s+(?:pic(?:-nya)?\s+)?(?:ke|kepada)\s+(.+)$/i.exec(text)
 if(m){const status=statusValue(m[2].replace(/^(?:kolom|status)\s+/i,''));return mutate(status?'task_status':'task_reassign',m[1],status?{status}:{pic:named(m[2])})}
 m=/^(?:tugas|task)\s+(.+?)\s+(?:tolong\s+)?(?:diubah|diganti|diupdate|diperbarui)\s+(?:progres|progress)(?:nya|-nya)?\s+(?:(?:jadi|menjadi|ke)\s+)?(\d{1,3})\s*(?:%|persen)?$/i.exec(text)
 if(m)return mutate('task_progress',m[1],{progres:m[2]})
 m=/^(?:tugas|task)\s+(?:berulang|rutin)\s*(.*?)\s+(?:tolong\s+)?(?:dibuatkan|dibuat|ditambahkan)(?:\s+untuk\s+(.+))?$/i.exec(text)
 if(m)return {kind:'propose',operation:'template_create',data:{...(m[1]?{judul:named(m[1])}:{}),...(m[2]?{pic:named(m[2])}:{})}}
 m=/^(?:tugas|task)\s*(.*?)\s+(?:tolong\s+)?(?:dibuatkan|dibuat|ditambahkan)(?:\s+untuk\s+(.+))?$/i.exec(text)
 if(m)return {kind:'propose',operation:'task_create',data:{...(m[1]?{judul:named(m[1])}:{}),...(m[2]?{pic:named(m[2])}:{})}}
 m=/^(?:pindahkan|tarik|ubah|tandai)\s+(?:kartu\s+)?(?:tugas|task)\s+(.+?)\s+(?:ke|jadi|menjadi)\s+(?:kolom\s+|status\s+)?(.+?)(?:\s+(?:di|pada)\s+(?:kanban|papan))?$/i.exec(text)
 if(m&&statusValue(m[2]))return mutate('task_status',m[1],{status:statusValue(m[2])!})
 m=/^(?:ubah|ganti|set)?\s*(prioritas|tanggal mulai|mulai)\s*(.*?)\s+(?:ke|jadi|menjadi)\s+(.+)$/i.exec(text)
 if(m)return mutate('task_update',m[2],{[m[1].toLowerCase()==='prioritas'?'prioritas':'mulai']:named(m[3])})
 m=/^(?:ubah|ganti|edit)\s+(?:judul|nama)\s+(?:tugas|task)\s+(.+?)\s+(?:jadi|menjadi|ke)\s+(.+)$/i.exec(text)
 if(m)return mutate('task_update',m[1],{judul:named(m[2])})
 m=/^(?:duplikasi|duplikasikan|salin|copy|gandakan)\s+(?:(?:tugas|task)\s+)?(.*?)(?:\s+(?:dengan judul|jadi|menjadi)\s+(.+))?$/i.exec(text)
 if(m)return mutate('task_duplicate',m[1],m[2]?{judul:named(m[2])}:{})
 m=/^(?:tambah(?:kan)?|buat(?:kan)?)\s+(?:wbs|subtugas|subtask)\s*(.*?)(?:\s+(?:untuk|di|pada)\s+(?:tugas|task)\s+(.+))?$/i.exec(text)
 if(m)return mutate('wbs_add',m[2]??'',m[1]?{judul:named(m[1])}:{})
 m=/^(?:tandai|ubah|selesaikan|centang|buka kembali)\s+wbs\s+(.+?)(?:\s+(?:jadi|menjadi)\s+(selesai|belum selesai))?$/i.exec(text)
 if(m)return mutate('wbs_toggle',m[1],{selesai:/belum selesai|buka kembali/i.test(text)?'tidak':'ya'})
 m=/^(?:selesaikan|tandai selesai|support selesai|bantuan selesai)\s+(?:(?:support|bantuan)\s+)?(.+)$/i.exec(text)
 if(m)return mutate('support_finish',m[1])
 m=/^(?:tambah(?:kan)?|buat(?:kan)?)\s+(?:syarat bukti|persyaratan bukti|evidence requirement)\s*(.*?)(?:\s+(?:untuk|di|pada)\s+(?:tugas|task)\s+(.+))?$/i.exec(text)
 if(m)return mutate('evidence_requirement',m[2]??'',m[1]?{deskripsi:named(m[1])}:{})
 m=/^(?:tambah(?:kan)?|kirim|unggah|upload)\s+(?:bukti|evidence|tautan bukti)\s+(https:\/\/\S+)\s+(?:untuk|di|pada)\s+(.+)$/i.exec(text)
 if(m)return mutate('evidence_link',m[2],{tautan:m[1]})
 m=/^(?:tambah(?:kan)?|kirim)\s+(?:bukti|evidence)\s+(.+)$/i.exec(text)
 if(m)return mutate('evidence_link',m[1])
 if(/^(?:unggah|upload|kirim)\s+(?:file|foto|gambar|lampiran)/i.test(text))return {kind:'help',topic:'evidence'}
 m=/^(setujui|tolak|approve|reject)\s+(?:permohonan|permintaan|pengajuan)\s+(?:tenggat|deadline)\s+(.+)$/i.exec(text)
 if(m)return mutate('deadline_decide',m[2],{keputusan:/tolak|reject/i.test(m[1])?'tolak':'setuju'})
 // Specific master-data names must be parsed before generic task deletion/edit.
 m=/^(buat(?:kan)?|tambah(?:kan)?|hapus|delete|ubah|edit|ganti|aktifkan|nonaktifkan|jeda|hentikan|lanjutkan)\s+(kategori(?: tugas)?|tugas berulang|tugas rutin|jadwal(?: berulang)?|organisasi|organization|unit|seksi|departemen)\s*(.*)$/i.exec(text)
 if(m){
  const verb=m[1].toLowerCase(),entity=/kategori/i.test(m[2])?'category':/berulang|rutin|jadwal/i.test(m[2])?'template':'org'
  const action=/^(buat|tambah)/.test(verb)?'create':/hapus|delete/.test(verb)?'delete':/aktifkan|jeda|hentikan|lanjutkan/.test(verb)?'toggle':'update'
  if(entity==='org'&&action==='toggle')return {kind:'clarify',question:'Organisasi dapat ditambah, diubah, atau dihapus sesuai hak akses. Apa yang ingin diubah?'}
  if(entity==='template'&&action==='create')return null
  const split=/^(.*?)\s+(?:jadi|menjadi|dengan nama)\s+(.+)$/i.exec(m[3])
  const data:Record<string,string>={}
  if(action==='create'){
   const section=/^(.*?)\s+di\s+seksi\s+(.+)$/i.exec(m[3]);if(m[3])data[entity==='template'?'judul':'nama']=named(section?section[1]:m[3]);if(section&&entity==='category')data.seksi=named(section[2])
   if(entity==='org'&&m[2].toLowerCase()!=='organisasi')data.tipe=/seksi/i.test(m[2])?'section':/unit/i.test(m[2])?'unit':'department'
  }
  if(split&&action==='update')data.nama=named(split[2])
  if(action==='toggle')data.aktif=/nonaktif|jeda|hentikan/.test(verb)?'tidak':'ya'
  return mutate(entity+'_'+action,action==='create'?'':split?split[1]:m[3],data)
 }
 m=/^(?:tandai|baca)\s+(?:semua\s+)?notifikasi\s*(.*?)\s*(?:sudah\s+)?(?:dibaca|terbaca)$/i.exec(text)
 if(m)return mutate(/semua/.test(text)?'notification_all':'notification_read',m[1])
 m=/^(?:tanggapi|balas|respon)\s+reminder\s+(.+?)(?:\s+(?:dengan|untuk)\s+(progres|support|tenggat))?$/i.exec(text)
 if(m)return mutate('reminder_response',m[1],m[2]?{tanggapan:m[2]}:{})
 m=/^(?:ubah|ganti|edit)\s+nama\s+(?:profil|akun|saya)(?:\s+saya)?(?:\s+(?:jadi|menjadi|ke))?\s+(.+)$/i.exec(text)
 if(m)return {kind:'propose',operation:'profile_name',data:{nama:named(m[1])}}
 if(/^(?:ubah|ganti|reset|hubungkan)\s+(?:email|password|sandi|whatsapp)/i.test(text))return {kind:'help',topic:'security'}
 const reads:Record<string,string>={'wbs':'wbs',subtugas:'wbs',support:'supports',bantuan:'supports','syarat bukti':'requirements',bukti:'requirements',komentar:'comments',persetujuan:'approvals',kategori:'categories','tugas berulang':'templates',jadwal:'templates',organisasi:'organizations',pengguna:'users',notifikasi:'notifications',reminder:'reminders',audit:'audit','riwayat aktivitas':'audit'}
 m=/^(?:lihat|buka|cek|tampilkan|cari)\s+(?:daftar\s+|semua\s+)?(.+?)(?:\s+(?:untuk|di|pada)\s+(?:tugas|task)\s+(.+))?$/i.exec(text)
 if(m&&reads[m[1].toLowerCase()])return {kind:'read',entity:reads[m[1].toLowerCase()],mode:'list',...(m[2]?{query:named(m[2])}:{})}
 return null
}
