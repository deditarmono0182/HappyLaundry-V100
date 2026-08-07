# HappyLaundry Enterprise V110.2 Tracking Premium

## Jalankan
```bash
npm install
copy .env.example .env
npm run dev
```

## Supabase
Jalankan `supabase/001_v100_foundation.sql`, lalu isi `.env`.

## Netlify
Build command: `npm run build`
Publish directory: `dist`
Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.


## V100.2
Order Laundry, status produksi, pembayaran awal, dan nota 58 mm.


## V100.4
Menu kasir transaksi baru, pembayaran langsung, kembalian, dan nota 58 mm.


## V100.5
Pengaturan profil laundry, template WhatsApp, nota dinamis, dan tombol WhatsApp setelah transaksi.


## V101.2
Kasir Pro dengan nota 58/80 mm, A4/PDF, QR status, barcode, diskon persen, dan pembayaran cepat.


## V101.2.1
Modernisasi UI kasir tanpa mengubah database dan alur transaksi.


## V101.3
UI premium untuk dashboard, sidebar, kasir, tombol, kartu, tabel, tablet, dan HP.


## V101.4
Perbaikan layout terpotong, sidebar premium, header, margin desktop, laptop, tablet, dan zoom browser.


## V101.5
Commercial UI untuk layout POS, sidebar compact, dashboard, tabel, tablet, dan HP.


## V102.0
Hardening kasir, shortcut keyboard, validasi, pencegahan klik ganda, loading overlay, dan penanda order terlambat.


## V103.0
Tracking publik via QR, PWA, backup JSON, import master data, lazy loading, offline shell, keamanan Netlify, dan optimasi Tahap 10.


## V103.2
Premium tracking: progress %, countdown estimasi, status colors, banner siap diambil, dan optimasi iPhone/Android.


## V103.2.1
Fix tabel settings produksi, auto refresh 15 detik, dan realtime sinkronisasi order.


## V104.0
Inventory lengkap: bahan, minimum stok, stok masuk/keluar, nilai persediaan, riwayat, dan supplier.


## V104.1
Reporting Fix: omzet, pengeluaran, laba, piutang, order, metode pembayaran, layanan, pelanggan, CSV, dan cetak dari data aktual Supabase.


## V104.1.1
Hotfix kompatibilitas schema order_items tanpa membutuhkan line_total.


## V104.2
Dashboard omzet multi-periode: 7 Hari, Bulan Ini, 3 Bulan, 6 Bulan, dan 12 Bulan.


## V104.2.2
Menu Scan QR Nota dengan kamera browser dan fallback nomor order manual.


## V104.2.3
QR Center: cari order di aplikasi, pembayaran cepat, detail order, produksi, cetak, WhatsApp, dan tracking.


## V104.3
QR pelanggan & kasir, link tracking di nota, WhatsApp tracking otomatis, dan update produksi via WhatsApp.


## V105.0
Professional Compact UI dengan pilihan Comfort, Compact, dan Ultra Compact untuk seluruh aplikasi.


## V105.0.1
Peningkatan kontras dan ketebalan teks di seluruh aplikasi agar tidak terlihat transparan.


## V106.0
Kategori layanan, filter kasir, input pengeluaran, kategori biaya, laba bersih, margin, dan export keuangan.


## V106.2
Daftar Piutang klik dari Dashboard/Keuangan serta Omzet per Kategori berupa jumlah Rupiah + persentase.


## V106.3
Kartu Pemasukan, Pengeluaran, dan Piutang pada Keuangan dapat diklik untuk membuka daftar rincian masing-masing.


## V107.0
Manajemen karyawan dan hak akses individual untuk Dashboard, Kasir, Order, QR Center, Produksi, Pelanggan, dan Layanan.


## V107.1
Pembuatan akun karyawan otomatis via Supabase Edge Function, password login, generate/reset password, dan kirim login WhatsApp.


## V107.2
Tambah karyawan dan akun login langsung dari aplikasi tanpa Edge Function atau Supabase CLI. Reset password via email Supabase.


## V108.0
Login karyawan memakai ID Akun manual + Password. Tanpa ID otomatis dan tanpa shift kerja.


## V108.0.2
Memperbaiki email internal login ID dari domain .local menjadi domain valid .app agar Supabase Auth menerima pembuatan akun.


## V109.0
Sistem karyawan internal ID Akun + password hash tanpa email. Supabase Anonymous Auth hanya digunakan untuk transport sesi authenticated agar RLS existing tetap berjalan.


## V109 Final Stable
Internal employee ID login stored in Supabase, extended permissions, login history, device tracking, and audit framework.


## V110 Blue Edition
Tema biru premium di seluruh aplikasi: sidebar, tombol, dashboard, kasir, QR, tracking, login, laporan, dan pengaturan.


## V110.1.1
Memperbaiki struktur JSX Dashboard dan mengganti grafik bar dengan line/area tanpa menghapus panel Dashboard lainnya.


## V110.1.2
Memperbaiki PWA/Windows title bar hijau dengan theme_color biru pada index.html dan manifest.webmanifest.


## V110.2
Tracking customer premium tanpa blok biru pada timeline; selesai hijau, aktif biru, pending abu-abu.
