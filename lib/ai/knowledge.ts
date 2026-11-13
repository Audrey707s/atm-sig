const topics:Record<string,{minimum:number;path:string;text:string}>={
 tasks:{minimum:1,path:'/tasks',text:'Buka Tugas untuk melihat pekerjaan sesuai hak akses. Pilih tugas untuk detail, progres, WBS, support, bukti, dan komentar. Pembuatan serta perubahan mengikuti role dan cakupan Anda. Kirim permintaan lengkap, misalnya judul tugas dan perubahan yang diinginkan. Perubahan dari asisten selalu perlu konfirmasi.'},
 review:{minimum:2,path:'/review-inbox',text:'Antrean review menampilkan tugas yang dapat Anda tinjau. Keputusan hanya dapat dijalankan jika aturan ATM mengizinkan Anda. PIC melengkapi bukti wajib dan mengajukan Review; status Selesai tetap mengikuti alur persetujuan.'},
 categories:{minimum:2,path:'/task-templates',text:'Kategori Tasks mengelompokkan pekerjaan. Pengelolaan kategori mengikuti role pengelola dan cakupan unit yang diberikan ATM.'},
 templates:{minimum:2,path:'/tasks/recurring',text:'Tugas Berulang menyimpan jadwal mingguan atau bulanan. Tentukan kategori, PIC, seksi, frekuensi, hari, dan tenggat. Pekerjaan dibuat oleh scheduler sesuai jadwal aktif.'},
 organizations:{minimum:1,path:'/organizations',text:'Organizations menampilkan struktur organisasi. Semua role dapat melihatnya; perubahan struktur hanya tersedia bagi pemegang hak pengelolaan.'},
 reports:{minimum:1,path:'/reports',text:'Laporan menampilkan tugas dalam cakupan akses Anda. Pilih periode/filter, lalu gunakan ekspor yang tersedia. Asisten tidak memperluas akses ke unit lain.'},
 calendar:{minimum:1,path:'/calendar',text:'Kalender merangkum tenggat tugas yang dapat Anda akses. Hubungkan Google Calendar dari halaman kalender bila ingin menyinkronkan agenda melalui otorisasi Google.'},
 users:{minimum:3,path:'/users',text:'Pengguna menampilkan akun dalam cakupan pengelolaan Anda. Undangan dan perubahan role/status tetap dilakukan melalui halaman ini dengan aturan hak akses ATM.'},
 security:{minimum:1,path:'/account',text:'Ubah password dan hubungan WhatsApp melalui Profil. Jangan mengirim password, kode login, atau API key melalui chat asisten.'},
 wbs:{minimum:2,path:'/tasks',text:'WBS membagi pekerjaan menjadi bagian berbobot. Buka detail tugas untuk menambah WBS dan menandai penyelesaiannya sesuai hak akses.'},
 support:{minimum:2,path:'/tasks',text:'PIC meminta support dari detail tugas. Penerima support yang ditugaskan dapat menandai bantuannya sudah diberikan.'},
 evidence:{minimum:2,path:'/tasks',text:'Lengkapi bukti wajib sebelum mengajukan review. Asisten dapat menyimpan tautan HTTPS; unggah file dilakukan melalui detail tugas.'},
 notifications:{minimum:1,path:'/notifications',text:'Notifikasi menampilkan pemberitahuan milik akun Anda. Notifikasi review ditujukan kepada reviewer yang ditugaskan. Reminder mengikuti checkpoint 50%, 80%, dan 90%.'},
}
export function helpReply(topic:string,level:number) {
 const k=topics[topic]
 if(!k||level<k.minimum) return {ok:false,message:'Permintaan tersebut berada di luar hak akses Anda. Saya dapat membantu pekerjaan dalam cakupan akun Anda.'}
 return {ok:true,message:k.text,path:k.path}
}
export function allowedKnowledge(level:number) {return Object.entries(topics).filter(([,v])=>level>=v.minimum).map(([key,v])=>({topic:key,text:v.text,path:v.path}))}
