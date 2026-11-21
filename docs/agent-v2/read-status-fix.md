# Perbaikan lanjutan FAIL — 21 November 2026

Source sebelumnya: 0b827f4. Pemeriksaan menemukan 23 FAIL pada run pembanding 60 kasus (planner dd1b6d0); sebagian sudah ditangani sebelumnya.

Perbaikan lanjutan:
- Instruksi eksplisit perubahan status, prioritas (termasuk menanyakan nilai yang belum disebut), dan awal tugas berulang dengan PIC yang jelas direncanakan secara deterministik, melalui validator dan executor backend yang sama.
- Bahasa review/report/calendar yang teridentifikasi di fixture tidak lagi bergantung output mode/entity dari model. Parser fallback bersama juga mengenal bentuk tersebut.
- Tidak mengubah RLS, hak role, status transition, prasyarat evidence/support/review, atau aturan konfirmasi.
- Permintaan multi-intent tidak dipotong diam-diam menjadi satu mutasi lokal.

Bukti: 23 skenario FAIL diregresi di batas planner, tanpa panggilan model, ditambah tes read-only vs quoted task title dan pemeriksaan backend pada full suite. Ini bukan klaim bahwa semua perubahan tugas nyata telah dieksekusi atau semua bahasa sudah dipahami.

Run pembanding 120 dan 60 tetap utuh. Run perbaikan 16 versi 0b827f4 dijeda dengan hasilnya tetap tersimpan. Dua PASS yang sudah diperoleh tidak perlu dijalankan ulang. Kasus yang masih perlu pengujian dipindahkan ke run revision baru; ATM_EVALUATION_FIX_RUN_ID harus menunjuk run baru sebelum deployment. Jangan mengganti label revision hasil yang telah dinilai.
