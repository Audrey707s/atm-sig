# Asisten ATM — web dan WhatsApp

## Perilaku

Ikon chat melayang tersedia pada shell semua akun aktif saat `ATM_AI_ENABLED=true`. Ikon dapat digeser dengan pointer atau tombol panah. Chat menyediakan hasil pencarian, panduan fitur berdasarkan role, pratinjau perubahan, Konfirmasi/Batal, dan tautan ke halaman terkait. Teks dirender sebagai teks biasa; percakapan web tidak disimpan di browser dan widget dipasang ulang ketika akun berganti.

Web memakai identitas dari `auth.getUser()` dan profil aktif. WhatsApp tetap melalui verifikasi secret, device, nomor, timestamp, dan hubungan akun yang telah ada. Pengguna tidak dapat memilih actor/role lewat pesan. Dispatcher mengikat pesan WhatsApp ke user dan generasi link yang diperiksa sebelum inferensi, lalu memeriksanya kembali saat transaksi. STOP, PUTUS, perintah angka, form dan shortcut lama tetap diproses oleh receiver lama.

Model hanya memiliki satu tool untuk **mengusulkan rencana**, tanpa fungsi execute. Katalog operasi disaring berdasarkan role sebelum dikirim. Server memvalidasi tool, entity, field dan nilai lagi. Model tidak menerima hasil database, daftar seluruh pengguna, key, password, JWT atau service role. Panduan diambil dari knowledge base fitur yang disaring menurut role. Tabel hasil dan ringkasan tugas disusun oleh server; model tidak mengarang data/sukses transaksi.

Aksi memanfaatkan 30 operasi bisnis ATM yang sudah tersedia melalui `wa_safe_operation`, RLS, RPC atomik, evidence gates, reviewer dan trigger yang sama. Semua perubahan memakai pratinjau yang dibatalkan di subtransaksi sebelum ditampilkan. Konfirmasi terpisah berlaku lima menit, sekali pakai, terikat akun/channel/link, memeriksa role dan versi data lagi. Judul tugas ambigu tidak pernah dipilih secara otomatis. Audit, perubahan, receipt WhatsApp dan outbox disimpan dalam transaksi yang sama; tidak ada balasan sukses sebelum commit. Dua channel memiliki konfirmasi terpisah.

Permintaan model dibatasi delapan per akun per menit. Empat pesan pengguna terakhir disimpan terbatas di tabel privat untuk memahami pengisian bertahap, tanpa jawaban/hasil database; konteks kedaluwarsa dan dibersihkan saat konfirmasi/batal. Tabel sesi dan limiter memakai RLS dengan akses service-only. Tidak ada tambahan akses anonim/browser ke fungsi actor-parameter.

## Gratis saja

Provider yang didukung hanya **Groq Free Plan**, model produksi `openai/gpt-oss-20b` melalui `@ai-sdk/groq`. Tidak ada AI Gateway, provider berbayar alternatif, kartu, langganan, atau fallback berbayar. `ATM_AI_FREE_PLAN_CONFIRMED=true` hanya diatur setelah pemilik memastikan akun tetap Free. Jangan meningkatkan akun tersebut ke Developer/Paid; jika akun diubah, nonaktifkan switch ini lebih dahulu. Aplikasi tidak dapat mengubah atau menjamin status billing akun provider dari API inferensi.

Konfigurasi server:

- `ATM_AI_ENABLED=true`: menampilkan widget dan mengaktifkan jalur AI WhatsApp setelah migrasi.
- `GROQ_API_KEY`: secret server untuk akun Free, jangan menggunakan `NEXT_PUBLIC_`.
- `ATM_AI_FREE_PLAN_CONFIRMED=true`: aktivasi inferensi hanya setelah pemeriksaan Free Plan.

Kunci/switch yang belum lengkap tidak memicu panggilan provider. Perintah umum lokal dan knowledge base tetap tersedia. Timeout/429/provider error menghasilkan pemberitahuan aman tanpa eksekusi atau pindah ke layanan berbayar. Tidak ada retry otomatis inferensi.

Contoh lokal tanpa biaya inferensi:

- `lihat tugas saya`
- `ringkasan tugas`
- `cari tugas Rekonsiliasi`
- `buat tugas Rekonsiliasi mulai 2026-11-14 08:00 tenggat 2026-11-15 16:00`
- `ubah tugas Rekonsiliasi jadi berjalan`
- `hapus tugas Rekonsiliasi` (hanya role yang berwenang; wajib konfirmasi)
- `cara menggunakan kalender`

Pesan bebas lain diterjemahkan model setelah kunci siap. Tugas yang perlu review tetap tidak dapat dipaksa selesai oleh asisten. File biner, ekspor dan pengaturan keamanan akun tetap melalui halaman web. ATM saat ini tidak memiliki modul transaksi keuangan/nominal: asisten meminta klarifikasi, tidak membuat tabel atau fitur fiktif.

## Validasi dan rilis

Build produksi, typecheck, ESLint dan uji otomatis telah dilakukan. Suite mencakup schema/RLS ATM asli, preview tanpa side effect, konfirmasi single-use/expired/wrong token, role downgrade, versi stale, nama ambigu, isolasi channel/user, link generation, receipt dedup, read scope, larangan browser/anon RPC, origin/session API, batas gratis tanpa provider call, dan interaksi widget.

Status pemasangan: migrasi hosted 20261113160217_atm_ai_assistant dan 20261113160704_ai_personal_calendar_scope telah dipasang. Groq Billing menunjukkan Current Plan Free ($0); kunci ATM-SIG tersimpan sebagai secret server. Uji hosted rollback-only lulus untuk read RLS, create preview tanpa persistensi, konfirmasi sekali pakai dan penolakan replay; actual PostgREST service read lulus dan anon ditolak HTTP 401. Uji model asli menghasilkan intent read dan create; alur model → validasi → pratinjau hosted memverifikasi tidak ada tugas tersimpan. Transport lokal Node ke Supabase mengalami timeout, sehingga pemeriksaan REST memakai transport proxy Python; perilaku deployment Vercel diperiksa terpisah. Format tanggal berakhiran WIB dinormalisasi sebelum validasi database. Enum tool dipersempit, reasoning dibatasi low dan inferensi diberi timeout 20 detik, tanpa retry/fallback berbayar. Pengiriman fisik balasan WhatsApp dari fitur AI baru tetap menjadi pemeriksaan penerimaan pengguna.
