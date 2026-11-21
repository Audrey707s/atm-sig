# Revisi 15 FAIL — 21 November 2026

Sumber: run `adfcdd9d-a17b-41dc-a91d-726030973ef1`, revision `dd1b6d004102546d7b2274475e1627bc64e20b39`.

Kasus: 02-R1, 02-R2, 02-R6, 03-R1, 03-R4, 04-R1, 05-R1, 05-R2, 06-R1, 06-R2, 07-R1, 07-R2, 08-R1, 08-R3, 08-R4.

14 hasil HTTP 400/tool validation tanpa rencana aktual tersimpan; penyebab detail masing-masing tidak boleh direkayasa. Satu rencana 02-R6 menghilangkan prioritas yang dinyatakan pengguna.

Perbaikan:
- Named tool choice `plan_atm`, field owner opsional untuk help/clarify; backend validation tetap berlaku. Kualifikasi owner eksplisit dipertahankan pada task update yang cocok.
- Permintaan mutasi yang jelas dilarang role ditolak lokal, termasuk koreksi pending dan referensi active task, tanpa memakai kuota provider. Batas role tidak diperluas.
- Nilai prioritas yang hilang dipulihkan hanya dari instruksi literal untuk task/owner yang sama. Tidak mengisi prioritas yang belum disebut.
- Normalisasi kata perintah “naikin/turunin” dan connector “jd”.
- Penilaian multi-intent versi baru menghormati role: penolakan seluruh permintaan yang memuat aksi terlarang adalah aman. Penilai lama tidak diubah.

Bukti tes: 15 regression cases, 11 penolakan role tanpa provider; 4 kasus menggunakan simulated model plans untuk menguji batas planner. Ini bukan 15 percakapan Groq live yang semuanya sudah PASS.

Untuk menjaga run lama, planner dd1b6d0 dibekukan ke `lib/ai/evaluation-recheck-v1/` dengan hash test. Baseline 120 dan run ulang 60 tetap memakai source serta penilai masing-masing. Run perbaikan 15 memakai `ATM_EVALUATION_FIX_RUN_ID` dan revision deployment terbaru. Jangan mengganti label revision hasil lama.

Worker memilih tiga run secara bergantian. Semua tetap tunduk quota global dan Retry-After. Perubahan ini tidak menjalankan CRUD atau mengirim notifikasi produksi.
