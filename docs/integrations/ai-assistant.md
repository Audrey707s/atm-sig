# ATM Agent — penerjemah percakapan lokal

Web dan WhatsApp menggunakan penerjemah bahasa Indonesia yang sama, tanpa inferensi Groq, API key AI, token, atau fallback provider. Kunci lama tidak diperlukan oleh jalur percakapan. Ini pengenalan intent dan isian berbasis aturan, bukan pelatihan model bahasa umum; kalimat ambigu ditanyakan kembali, bukan ditebak atau dijalankan.

## Alur

Pesan → normalisasi kata permintaan (isi judul bertanda kutip tetap utuh) → intent/target/isian → katalog operasi sesuai role → pencarian melalui cakupan ATM/RLS → pertanyaan isian yang belum lengkap → pratinjau → konfirmasi sekali pakai → operasi transaksi dan audit → tautan hasil.

Draft menyimpan operasi, target ID yang telah dipilih, isian, opsi, masa berlaku, identitas pengguna, channel, conversation ID web atau generasi hubungan nomor WhatsApp. Angka pilihan hanya berlaku untuk daftar aktif. Konfirmasi tidak dapat mengambil target dari percakapan pengguna lain atau thread web berbeda. STOP, PUTUS, dan pembatalan menghapus state terkait. Pembatasan permintaan server tetap berlaku untuk mencegah spam; ini bukan kuota provider.

## Contoh

- “tolong bukain task nata”
- “hapus tugas A milik nata” / “tugas A milik nata dihapus”
- “ganti PIC tugas pertama milik Audrey ke Nata”
- “PIC tugas pertama milik Audrey diganti menjadi Nata”
- “geserin tugas rekonsiliasi ke berjalan” (perubahan status Kanban)
- “update progres rekonsiliasi jadi 70%”
- “bikinin tugas untuk Audrey”
- “buatkan tugas berulang untuk Audrey”, lalu judul, seksi, kategori, “setiap Senin”, “hari yang sama”, “dua hari setelah jadwal”
- “tambahkan WBS cek saldo di tugas rekonsiliasi”, lalu bobot
- “minta bantuan Nata untuk tugas rekonsiliasi”, lalu deskripsi
- “tambahkan bukti https://… untuk syarat laporan”

Judul/nama dapat ditulis dengan atau tanpa tanda kutip. Kutip menandakan kecocokan judul persis. Jika ada beberapa hasil, bot meminta pilihan. Jika tidak ditemukan, bot menyimpan maksud dan meminta nama/ID yang lebih tepat. Kalimat yang belum dikenali mendapat pertanyaan klarifikasi lokal, tanpa panggilan provider.

## Cakupan dan batas

Seluruh 31 operasi katalog memiliki jalur bahasa sehari-hari: task create/update/delete/duplicate/status/progress/review/comment/deadline/reassign; WBS add/toggle; support add/finish; syarat bukti/tautan; keputusan tenggat; kategori create/update/delete; jadwal create/update/toggle/delete; organisasi create/update/delete; baca notifikasi satu/semua; respons reminder; nama profil. Role, cakupan seksi/unit, PIC, reviewer, syarat bukti dan status yang sah tetap ditegakkan oleh server. Permintaan terlarang wajib ditolak.

Menu menyediakan tautan halaman dan data yang diizinkan. Unggah file, OAuth Google Calendar, perubahan email/password/verifikasi, undangan/penetapan role, ekspor file dan pemulihan tetap memakai UI yang sesuai; chatbot tidak mengaku menjalankan tindakan yang belum didukung. Pengguna dapat meminta panduan dan tautan tanpa kuota AI.

Popup dapat digeser melalui pegangan logo dengan mouse/sentuhan atau tombol panah. Home mengembalikan posisi awal. Ukuran/posisi dikoreksi saat viewport berubah; tombol, isi chat dan composer tidak menjadi pegangan drag.

## Verifikasi

Uji matriks mencocokkan setiap operasi dengan katalog database agar operasi baru tidak diam-diam terlewat. Percakapan lengkap dijalankan pada fixture database sekali pakai melalui parser → RPC pratinjau → token konfirmasi → pemeriksaan hasil. Uji tambahan memeriksa enam role, RLS, task ambigu, pilihan angka, state kedaluwarsa, perubahan versi data, isolasi thread/channel dan generasi nomor WhatsApp. Data bisnis asli tidak dihapus/dipindahkan untuk pengujian.
