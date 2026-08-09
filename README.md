# HappyLaundry Enterprise V113.0.5 Expense Receipt Proof

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


## V110.3
Halaman Order: kartu Terlambat, kolom Estimasi Selesai, pencarian order/pelanggan/telepon/status/pembayaran, dan font sedikit lebih besar. Tracking publik tetap nomor order.


## V110.4
Bagi hasil per kategori layanan di Dashboard Keuangan dengan persentase editable Owner dan penyimpanan Supabase.


## V110.5
Memperbaiki ON CONFLICT pada penyimpanan persentase bagi hasil dengan UNIQUE(category) yang kompatibel dengan Supabase upsert.


## V110.6
QR Center memakai permission-safe SECURITY DEFINER RPC untuk mencari satu order, sehingga akun Owner/karyawan berizin QR tidak terkena RLS Permission denied.


## V110.7
Backup Data kini memiliki Owner-only Reset Data untuk Order, Pelanggan, Layanan, dan ALL DATA dengan konfirmasi dua tahap.


## V110.7.1
Reset Order fix: direct RPC after typed confirmation, explicit child deletes, remaining-order verification, success count, auto refresh.


## V110.7.2
Force refresh PWA cache, visible reset version, and dedicated reset-order RPC.


## V110.7.3
Database diagnostic for v100_orders/view + hard reset RPC with table locks and post-delete verification.


## V110.7.4
Direct Reset Order from diagnostic panel using owner-only TRUNCATE v100_orders CASCADE and immediate verification.


## V110.7.5
Semua tombol Reset Data memakai direct inline confirmation + unified Owner-only RPC.


## V110.8
Pengaturan Print Nota tersimpan di Supabase, preview langsung, default paper/template/font/QR/barcode, dan integrasi Cetak Default di Kasir.


## V110.9
Export XLS dan PDF untuk Pemasukan, Pengeluaran, Piutang, Bagi Hasil, dan Laporan Owner. Export mengikuti filter/periode aktif.


## V110.10
Kasir desktop memakai scroll independen pada form transaksi kiri dan Total Belanja sticky di kanan.


## V110.11
Pengaturan Comfort/Compact/Ultra Compact dipindahkan dari Settings ke Dashboard agar karyawan dapat mengubah tampilan per perangkat.


## V110.12
Total Belanja dipisahkan dari scrollbar kanan agar tidak terpotong.


## V111.0
Modul Owner-only Absensi & Penggajian: hadir/izin/sakit/alpha, uang hadir, tunjangan, bonus, bagi hasil omzet, total gaji, XLS/PDF.


## V111.1
Bagi hasil gaji dihitung dari omzet kategori layanan yang dipilih per karyawan, bukan total omzet seluruh laundry.


## V111.2
Satu karyawan dapat memiliki banyak kategori bagi hasil dengan persentase berbeda per kategori.


## V111.3
Login pertama karyawan per hari otomatis membuat status Hadir, dengan sumber Auto Login dan jam masuk; status manual Owner tidak ditimpa.


## V111.4
Owner dapat override absensi dengan alasan wajib; Hadir Manual dibedakan dari Auto Login dan tercatat di audit log.


## V112.0
Absensi karyawan menggunakan login + QR statis yang dapat diganti Owner + GPS radius. Login saja tidak lagi dihitung Hadir. Owner override tetap tersedia.


## V112.1
Tombol global ← Kembali pada seluruh halaman yang memakai PageHeader, dengan browser-history dan fallback aman.


## V112.2
Tombol kembali global dipindahkan ke pojok kanan atas, berbentuk bulat dan sticky.


## V112.3
Owner dapat upload logo nota ke Supabase Storage, mengatur ukuran/posisi, hapus custom, restore default, dan logo dipakai pada thermal/A4/PDF.


## V112.3.1
Hard fix posisi logo Kiri/Tengah/Kanan memakai margin langsung + inline style pada preview dan nota cetak.


## V112.4
Produksi dapat scan QR nota tracking untuk menemukan order, menyorot kartu, dan menjalankan Tahap Berikutnya dengan cepat.


## V112.4.1
Input angka global auto-select dan decimal keyboard; berat/jumlah Kasir serta Order mendukung edit kosong sementara dan koma/titik desimal.


## V112.5
Dashboard Order menampilkan jenis layanan + jumlah/berat, pencarian berdasarkan layanan, dan rincian layanan pada Detail Order.


## V112.6
Order mendapat Export All/XLS Filter/PDF Filter, filter status pembayaran + cucian, dan badge status dapat diklik untuk proses berikutnya.


## V112.7
Dashboard menampilkan Top 5 pelanggan berdasarkan jumlah transaksi, total belanja, dan transaksi terakhir.


## V112.8
Dashboard Pelanggan mendapat analitik transaksi, total belanja, rata-rata transaksi, pelanggan baru, Top 10, dan pelanggan tidak kembali 60+ hari.


## V112.8.1
Preview nota mempunyai tombol X kanan atas dan ← Tutup Preview Nota dengan fallback kembali ke Kasir pada iPhone/Safari.


## V112.8.2
Tombol Cetak Ulang Nota dibuat jelas di Order dan Detail Order, dengan preview, layanan, Cetak/PDF, X, dan Tutup Preview untuk iPhone.


## V112.8.3
Preview nota Kasir dan Cetak Ulang diperbesar di iPhone/HP tanpa mengubah ukuran hasil print thermal/A4.


## V112.8.4
Menu Pembayaran mendapat Bayar Saja dan Bayar & Ambil. Bayar & Ambil melunasi sisa tagihan dan langsung mengubah status order menjadi Selesai.


## V112.8.5
Order mendapat Konfirmasi Kurir dengan foto bukti per nomor order. Foto/waktu/akun tersimpan di Supabase dan status otomatis menjadi Selesai.


## V112.8.6
Detail Order mendapat tombol Buka Tracking Pelanggan yang membuka /track/<nomor-order> di tab baru.


## V112.9
QRIS & rekening dapat dikelola Owner, tampil otomatis di Tracking Pelanggan, pelanggan upload bukti bayar, dan Owner/karyawan mengonfirmasi dari menu Pembayaran.


## V112.9.1
Tracking pelanggan dipadatkan secara vertikal dan background biru pada baris progress cucian dihilangkan, tanpa mengubah fitur QRIS/Transfer.


## V112.9.2
Perbaikan preview nota di iPhone/mobile: ditambahkan meta viewport dan diperbesar agar tampilan nota tidak kecil saat selesai transaksi di Kasir maupun saat cetak ulang nota.


## V112.9.3
Pengaturan WhatsApp memiliki preview visual, QRIS/rekening aktif, Copy Pesan, dan Kirim WhatsApp Uji.


## V112.10
Loyalty/Member: kode member, poin otomatis saat lunas, bonus member baru, riwayat poin, penyesuaian poin, filter Member, dan pengaturan Owner.


## V113.0
Dashboard Owner baru Laba & Target: omzet aktual, pengeluaran, laba bersih operasional, piutang, target omzet/laba/order, progress target, tren 6 bulan, top layanan dan top pengeluaran.


## V113.0.1
QR Center memakai html5-qrcode untuk kompatibilitas tablet Android.


## V113.0.2
Fix build scanner TS2339. Dashboard Laba kini otomatis memasukkan gaji (hadir+tunjangan+bonus+bagi hasil) sebagai biaya dan kartu KPI dapat diklik untuk melihat detail.


## V113.0.3
Gaji otomatis dari Absensi & Gaji sekarang masuk ke total dan detail Pengeluaran di Dashboard Keuangan, termasuk export dan kategori pengeluaran terbesar.


## V113.0.4
Karyawan dengan permission Keuangan dapat input pengeluaran, tetapi seluruh bagian pengaturan Bagi Hasil disembunyikan dan write access Bagi Hasil tetap Owner-only di database.


## V113.0.5
Tambah Pengeluaran dapat menyimpan foto/PDF nota bukti secara private dan menampilkannya kembali dari Keuangan/Detail Pengeluaran.
