# Perubahan email akun ATM

Semua role aktif dapat membuka Profil → Email akun → Ubah email. API hanya menerima satu alamat email baru; identitas akun berasal dari `auth.getUser()` dan profil aktif. Origin, bentuk payload, panjang, format alamat, alamat yang sama, dan kegagalan/429 diverifikasi sebelum hasil ditampilkan. Tidak ada service-role key pada alur web ini.

Pengiriman memakai Supabase Auth `updateUser` dengan Gmail SMTP proyek yang sudah ada. Secure email change tetap aktif: pemilik menyelesaikan verifikasi pada alamat lama dan baru. Permintaan baru hanya menampilkan alamat tertunda; alamat login lama tetap aktif sampai konfirmasi selesai. Redirect production yang sudah diizinkan mencakup `/auth/email-change`.

Callback mendukung PKCE dan token hash bertipe `email_change`, tanpa redirect eksternal dari parameter pengguna. Konfirmasi pertama dapat belum menyelesaikan seluruh proses. UI meminta pengguna memeriksa email aktif dan menyelesaikan konfirmasi lain jika masih tertunda. Callback tidak mengklaim email sudah berubah hanya berdasarkan tautan masuk. Header no-store/no-referrer mengurangi kebocoran kode verifikasi. Dengan PKCE, buka tautan pada browser tempat permintaan dimulai.

Migrasi `20261116055024_sync_confirmed_account_email.sql` menyelaraskan `public.users.email` hanya saat Auth menyimpan email terkonfirmasi. Fungsi trigger berada di schema privat, search_path kosong, tanpa hak eksekusi browser. Perubahan alamat dan audit berjalan satu transaksi; ID, role, unit, tugas dan hubungan WhatsApp tidak berubah. Reminder membaca alamat profil yang sudah terverifikasi. Tidak ada sinkronisasi alamat pending atau reset password otomatis.

Tes mencakup penolakan origin/identitas palsu/profil nonaktif, validasi dan throttling, callback/no open redirect, UI pending/error, serta trigger dan ACL menggunakan Postgres lokal. Pengaturan hosted diperiksa: SMTP aktif, secure email change aktif, trigger terpasang, tidak ada ketidaksamaan email Auth/profil. Email akun nyata tidak diganti dalam pengujian; pemilik menyelesaikan verifikasi kotak masuk ketika memilih alamat baru.
