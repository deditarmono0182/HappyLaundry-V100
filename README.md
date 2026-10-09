HappyLaundry V113.0.53 - Payroll Status Nihil Fix

# HappyLaundry Enterprise V113.0.7 Delete Approval Notification

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


## V113.0.6
Penghapusan Order dan Pengeluaran memakai alur approval Owner, alasan wajib, konfirmasi kuat, audit request, dan penghapusan bukti Storage terkait.


## V113.0.7
Owner mendapat badge merah, Dashboard alert, dan toast untuk permintaan hapus pending. Count diperbarui via Realtime, focus, polling 30 detik, dan event lokal.


V113.0.53
- Total Gaji Rp0 + Dibayar Rp0 sekarang berstatus Nihil, bukan Belum Dibayar.
- Status Belum Dibayar hanya untuk Total Gaji > Rp0 dan belum ada pembayaran.
- Tidak mengubah perhitungan gaji, riwayat pembayaran, komisi, atau database.


## V113.0.68 Owner Report Order + Commission
Laporan Owner membedakan omzet terbayar dari order masuk, mengurangi komisi produksi/kurir pada laba bersih, dan menambahkan grafik jumlah order masuk harian. Tidak ada SQL baru.


## V113.0.69 Owner Business Graph
- Omzet = total nilai order/barang masuk pada periode.
- Kas Masuk = pembayaran pelanggan yang benar-benar diterima.
- Laba Bersih = omzet barang masuk - pengeluaran - komisi produksi - komisi kurir.
- Grafik gabungan menampilkan Omzet/Barang Masuk, Kas Masuk, Laba Bersih, dan Jumlah Order per periode.
- Tidak memerlukan SQL baru.


## V113.0.70 Category Order Value Fix
- Omzet/Barang Masuk per Kategori kini dihitung dari nilai order masuk, bukan pembayaran yang sudah diterima.
- Kategori Satuan akan muncul bila ada order Satuan pada periode terpilih, walaupun order belum dibayar.
- Diskon dialokasikan proporsional ke item agar total kategori konsisten dengan nilai order bersih.
- Tidak ada SQL baru.

## V113.0.72 — Kas Bon + Gaji Saya
- Kas Bon per karyawan di menu Gaji.
- Potongan kas bon dan saldo sisa.
- Menu Gaji Saya untuk akun karyawan, hanya data sendiri.
- Rincian komisi order dan riwayat pembayaran.


## V113.0.73 — Build Fix
- Memperbaiki PageHeader Gaji Saya yang belum mengirim prop eyebrow wajib.
- Tidak ada perubahan database / SQL baru.
test


## V113.0.74 — Kas Bon Safe Cancel + Compact Payroll
- Owner dapat membatalkan kas bon dengan alasan wajib dan audit tetap tersimpan.
- Potongan kas bon yang belum masuk payroll berbayar dikembalikan otomatis.
- Jika payroll terkait sudah dibayar, pembatalan otomatis diblokir demi konsistensi data.
- Saldo gaji karyawan dapat tampil minus bila kas bon melebihi hak gaji.
- Tabel payroll dibuat lebih padat.
- Memerlukan SQL 060.


## V113.0.75 — Finance Payroll Complete
- Laporan Keuangan sekarang memasukkan komisi produksi dan komisi kurir ke biaya payroll.
- Rincian payroll: uang hadir, tunjangan, bonus, bagi hasil, komisi produksi, komisi kurir.
- Kas bon tidak dihitung sebagai biaya usaha tambahan agar tidak double-count.
- Tidak ada SQL baru.


## V113.0.76 — Revenue Share Category Sync
- Rincian Bagi Hasil di Keuangan sekarang memakai nilai barang/order masuk sesuai periode, sama dengan Dashboard.
- Kategori Satuan, Express, Kiloan, dan kategori lain ikut tampil sesuai order masuk walaupun belum dibayar.
- Payroll Owner, laporan biaya payroll, dashboard target, dan Gaji Saya diselaraskan memakai dasar kategori yang sama.
- SQL 061 memperbarui RPC Gaji Saya agar bagi hasil kategori berbasis order masuk.


## V113.0.77 — Category Drilldown
- Klik kategori Express/Kiloan/Satuan di Dashboard untuk melihat detail order dan layanan pada periode grafik terpilih.
- Menampilkan tanggal, nomor order, pelanggan, layanan, qty/berat, nilai kontribusi, total kategori dan jumlah order.
- Tidak perlu SQL baru.


## V113.0.78 — Order Category Search & Filter
- Search Order sekarang bisa mencari kategori layanan seperti Express, Kiloan, dan Satuan.
- Menambahkan dropdown Kategori Layanan di halaman Order.
- Order multi-kategori tetap muncul jika salah satu item cocok dengan kategori yang dipilih.
- Tidak perlu SQL baru.


## V113.0.79 — Clean Category Ranking UI
- Merapikan Omzet / Barang Masuk per Kategori menjadi ranking card yang lega dan tidak tumpang tindih.
- Nama kategori, nominal, persentase, progress bar, dan tombol Lihat detail tetap terlihat jelas.
- Tidak ada perubahan database / SQL baru.


## V113.0.80 — Category List Card UI
- Tampilan kategori dibuat seperti daftar Pelanggan dengan Transaksi Terbanyak.
- Menampilkan ranking, jumlah order, jumlah item layanan, nilai barang masuk, dan kontribusi.
- Baris tetap dapat diklik untuk drilldown detail kategori.
- Tidak ada SQL baru.


## V113.0.81 — Employee Password Reset UI
- Tombol Reset Password di Kelola Karyawan dibuat berlabel jelas, bukan hanya ikon.
- Owner dapat memilih karyawan, mengisi password baru + konfirmasi, atau generate password otomatis.
- Menggunakan RPC reset password yang sudah tersedia; tidak perlu SQL baru.


## V113.0.82 — Employee Action Layout Fix
- Kolom Aksi Kelola Karyawan dibuat lebih lebar dan stabil.
- Tombol Edit, Password, dan Nonaktifkan tidak lagi tumpang tindih.
- Label Reset Password dipadatkan menjadi Password.
- Tidak ada SQL baru.


## V113.0.83 — Overdue Order Filter & Shortcut
- Tambah pilihan Terlambat pada filter Status Cucian.
- Kartu Terlambat di halaman Order sekarang bisa diklik untuk langsung memfilter order terlambat.
- Filter lain tetap dapat dikombinasikan.
- Tidak ada SQL baru.


## V113.0.84 — Overdue Runtime Fix
- Memperbaiki error runtime "Cannot access before initialization" pada halaman Order.
- Helper isOverdue sekarang didefinisikan sebelum dipakai oleh filter Terlambat.
- Fitur filter Terlambat tetap dipertahankan.
- Tidak ada SQL baru dan tidak ada perubahan data.


## V113.0.85 — Overdue Dashboard Fix
- Helper keterlambatan dipindah ke level module agar tidak memicu error initialization saat halaman Order dirender.
- Tambah kartu Terlambat pada Dashboard.
- Klik kartu Terlambat membuka /orders?status=overdue.
- Halaman Order membaca query status=overdue dan otomatis mengaktifkan filter Terlambat.
- Pilihan Terlambat tetap ada di filter Status Cucian.
- Tidak ada SQL baru dan tidak mengubah data.


## V113.0.86 — Dashboard Compact 4x2
- Ringkasan Dashboard desktop dibuat 4 kolom x 2 baris.
- Kartu dipersempit dan diseragamkan tingginya.
- Kartu Terlambat menyatu rapi dengan kartu lain.
- Ditambah kartu Kas Masuk Hari Ini sebagai kartu ke-8.
- Tablet dan HP memakai 2 kolom.
- Tidak ada SQL baru.


## V113.0.87 — V86 Baseline + Money Typography Fix
- Dibangun langsung dari V113.0.86 Dashboard Compact 4x2.
- Kartu Terlambat dan filter Terlambat dari V113.0.86 dipertahankan.
- Nilai uang di Dashboard diperkecil dan tidak bold.
- Nilai jumlah order/status tetap menonjol.
- Layout compact 4x2 V113.0.86 tetap dipertahankan.
- Tidak ada SQL baru.


## V113.0.88 — Overdue Card Same Size Fix
- Kartu Terlambat memakai komponen StatCard yang sama dengan kartu KPI lain.
- Ukuran, tinggi, padding, ikon, dan typography sama di desktop dan HP.
- Warna peringatan tetap dipertahankan.
- Klik kartu tetap membuka Order dengan filter Terlambat.
- Perubahan nilai uang kecil/non-bold V113.0.87 tetap dipertahankan.
- Tidak ada SQL baru.


## V113.0.89 — Overdue Card Exact Grid Match
- Kartu Terlambat tidak lagi dibungkus elemen button.
- Kartu Terlambat sekarang menjadi elemen `stat-card` langsung di grid, sama seperti kartu KPI lain.
- Lebar, tinggi, padding, dan responsif HP/laptop mengikuti kartu lain secara identik.
- Klik dan keyboard Enter/Space tetap membuka Order dengan filter Terlambat.
- Warna peringatan tetap dipertahankan.
- Perubahan nilai uang kecil/non-bold tetap dipertahankan.
- Tidak ada SQL baru.


## V113.0.91 — Sticky Order Table Header
- Judul kolom tabel Order tetap terlihat saat scroll ke bawah.
- Header Layanan, Status, Pembayaran, Total, Estimasi Selesai, Pengiriman, Kasir, Dibuat, dan Aksi menjadi sticky.
- Kolom Aksi tidak dibuat sticky di kanan.
- Scroll horizontal tetap normal seperti sebelumnya.
- Tampilan mobile card tidak diubah.
- Tidak ada SQL baru.


## V113.0.93 — Find Missing Worker / Courier
- Fokus utama: mencari transaksi yang belum diisi Yang Mengerjakan dan/atau Kurir.
- Tambah filter Penugasan: Yang Mengerjakan Kosong, Kurir Kosong, Salah Satu Kosong, Keduanya Kosong.
- Tambah tombol pencarian cepat beserta jumlah order yang masih kosong.
- Order yang penugasannya kosong diberi badge peringatan di desktop dan HP.
- Tidak menambahkan checkbox bulk correction.
- Sticky header V113.0.91 tetap dipertahankan.
- Tidak ada SQL baru.


## V113.0.94 — Profit & Loss Report
- Tambah menu Owner: Laba Rugi.
- Periode cepat: Hari Ini, 7 Hari, Bulan Ini, Bulan Lalu, dan Custom.
- Ringkasan Pendapatan, Biaya Operasional, Biaya Karyawan, Laba Bersih, Margin.
- Detail klik untuk sumber order, kas masuk, piutang, biaya, uang hadir, tunjangan, bonus, bagi hasil, komisi produksi, dan komisi kurir.
- Tunjangan dan bonus diprorata per hari untuk periode parsial.
- Pengeluaran manual yang terdeteksi sebagai payroll/SDM dikeluarkan dari Biaya Operasional agar tidak dihitung ganda dengan payroll otomatis.
- Export XLS/PDF.
- Dibangun dari baseline V113.0.93.
- Tidak ada SQL baru.


## V113.0.95 — Reserve & Employee Liability
- Laporan Laba Rugi memisahkan Laba Bersih Operasional dan Laba Bersih Setelah Cadangan.
- Tambah pengaturan Owner untuk Penyusutan Peralatan, Cadangan THR, Cadangan Kesehatan, dan Cadangan Tak Terduga.
- Setiap cadangan bisa metode nominal per bulan atau persentase omzet.
- Nominal bulanan diprorata sesuai hari periode; persentase dihitung dari omzet periode.
- Cadangan tidak dianggap kas keluar otomatis.
- Export XLS/PDF ikut menampilkan cadangan.
- SQL baru: 062_v113_0_95_reserve_settings.sql.


## V113.0.96 — Visible Reserve Breakdown
- Laporan Laba Rugi menampilkan kartu Cadangan & Kewajiban langsung di halaman utama.
- Setiap cadangan aktif terlihat satu per satu: Penyusutan, THR, Kesehatan, Tak Terduga.
- Setiap baris menampilkan metode dan nilai cadangan periode.
- Total Cadangan & Kewajiban terlihat jelas tanpa perlu membuka modal.
- Tidak ada SQL baru.


## V113.0.97 — Team Commission Split
- Tetap bisa memilih 1 Yang Mengerjakan dan 1 Kurir seperti sebelumnya.
- Tambah opsi Kerja Tim untuk produksi dan Tim Kurir.
- Penanggung jawab utama menentukan persentase total komisi order.
- Jika ada beberapa anggota, total komisi dibagi rata otomatis ke semua anggota.
- Payroll/Gaji Saya tetap membaca v113_commission_ledger, sekarang mendukung anggota tim.
- Nota/detail order menampilkan beberapa nama dengan tanda +.
- Order lama tetap kompatibel memakai data komisi lama.
- SQL baru: 063_v113_0_97_team_commission_split.sql.


## V113.0.98 — Operational Attention Center
- Tambah Pusat Peringatan Operasional di Dashboard Owner.
- Ringkas order terlambat, piutang/belum lunas, siap diambil >24 jam, Yang Mengerjakan kosong, Kurir kosong, estimasi selesai kosong, dan permintaan hapus pending.
- Klik tiap jenis peringatan langsung membuka daftar terkait.
- Orders mendukung shortcut URL untuk assignment=missing_worker/missing_courier dan attention=ready_long/no_due.
- Tidak ada SQL baru.


## V113.0.99 — Order Extra Charge & Receipt Correction
- Tambah tombol Owner di Detail Order: Koreksi Nota / Tambah Biaya.
- Cocok untuk Extra Deep Cleaning atau biaya tambahan setelah order dibuat.
- Biaya tambahan menambah subtotal, total, dan otomatis menghitung ulang status/sisa pembayaran.
- Jika order sebelumnya Lunas lalu ada biaya tambahan, status dapat berubah menjadi DP sampai selisih dibayar.
- Riwayat biaya tambahan tampil di Detail Order dan Cetak Ulang Nota.
- Komisi berbasis total ikut tersinkron melalui trigger komisi yang sudah ada.
- SQL baru: 064.


## V113.0.100 — Team Assignment Correction
- Koreksi Penanggung Jawab di halaman Order sekarang mendukung Team Pengerjaan dan Team Kurir.
- Tetap bisa koreksi perorangan seperti sebelumnya.
- Bisa menambah/menghapus anggota team saat koreksi order.
- Komisi team dibagi rata otomatis.
- Proteksi payroll berbayar tetap dipertahankan, termasuk anggota team yang akan dihapus.
- Riwayat koreksi team disimpan di tabel audit baru.
- SQL baru: 065.


## V113.0.101 — Sticky Payroll List
- Bagian Daftar Gaji sekarang memakai area scroll sendiri.
- Judul Daftar Gaji dan tombol Simpan Bonus tetap di atas saat daftar karyawan digulir.
- Header kolom tabel gaji sticky agar nama kolom tetap terlihat saat scroll ke bawah.
- Horizontal scroll tetap tersedia untuk tabel lebar.
- Tidak ada SQL baru.


## V113.0.102 — Finance & Reports Hub
- Sidebar Owner disederhanakan dengan satu menu: Keuangan & Laporan.
- Menu Owner yang digabung: Keuangan, Laba Rugi, Target Bisnis, Piutang, Kas Harian, Closing Harian, dan Laporan Owner.
- Semua route/halaman lama tetap dipertahankan agar fitur dan link lama tidak rusak.
- Hub juga menyediakan akses cepat ke Detail Pemasukan, Detail Pengeluaran, dan Absensi & Gaji.
- Menu non-Owner tetap mengikuti permission lama.
- Tidak ada SQL baru.


## V113.0.103 — Live Master Data & Login Reliability
- Kasir otomatis memperbarui Pelanggan, Layanan, daftar karyawan komisi, dan setting komisi setiap 30 detik.
- Master data juga refresh saat browser kembali fokus, kembali online, atau tab Kasir aktif kembali.
- Kolom pelanggan refresh saat difokuskan; picker layanan selalu mencoba mengambil data terbaru sebelum dibuka.
- Tambah tombol Refresh Data manual serta indikator waktu sinkron terakhir.
- Pelanggan baru langsung dimasukkan ke daftar lokal setelah berhasil tersimpan ke Supabase.
- Login Owner/Karyawan diperkuat dengan retry + timeout pada pemuatan profil.
- Login Karyawan memverifikasi sesi dan profil sebelum membuka aplikasi untuk mengurangi kasus login berhasil tetapi layar/profile kosong.
- Pesan error Owner tidak lagi selalu dianggap password salah ketika masalah sebenarnya koneksi/server.
- Tidak ada SQL baru.


## V113.0.104 — Colorful Professional Finance Dashboard
- Tampilan mengikuti mockup colorful profesional: biru tetap menjadi identitas utama HappyLaundry, ditambah aksen hijau, amber, merah lembut, ungu, cyan.
- Keuangan & Laporan sekarang menampilkan KPI berwarna, Grafik Keuangan & Order 7 Hari, Status Order, Status Pembayaran, dan Metode Pembayaran.
- Semua angka berasal dari data Supabase yang sudah digunakan aplikasi, bukan data contoh.
- Menu laporan tetap berada di halaman yang sama dengan kartu warna berdasarkan fungsi.
- Dashboard utama diberi aksen pastel pada kartu ringkasan tanpa mengubah fungsi.
- Tidak ada SQL baru.


## V113.0.105 — Global Color UI Consistency
- Warna pastel profesional diterapkan ke seluruh aplikasi utama, bukan hanya Keuangan & Laporan.
- Dashboard, Kasir, Order, Produksi, Pelanggan, Kas Harian, Pembayaran, Piutang, Payroll, Laba Rugi, Laporan, dan kartu pengaturan dibuat lebih konsisten.
- Kartu diperkecil, jarak antar elemen dirapatkan, font judul/angka dibuat lebih proporsional dan tidak terlalu tebal.
- Tabel dibuat lebih compact dengan header yang lebih ringan dan row hover lembut.
- Warna status mengikuti fungsi: biru informasi, hijau selesai/lunas, amber proses/peringatan, merah masalah/piutang, ungu proses/komisi.
- Tidak ada SQL baru dan tidak ada perubahan struktur database.


## V113.0.107 — Consistent Profit Formula
- Menyamakan definisi Laba Bersih Operasional di Dashboard, Keuangan & Laporan, dan Laba Rugi.
- Rumus resmi: Omzet / Barang Masuk - Biaya Operasional - Biaya Karyawan.
- Biaya Karyawan mencakup uang hadir, tunjangan, bonus, bagi hasil, komisi produksi, dan komisi kurir.
- Cadangan tetap terpisah sebagai Laba Setelah Cadangan.
- Dashboard Kontrol Bisnis Owner sekarang mengambil Biaya Operasional dari sumber resmi pengeluaran dan menampilkan Biaya Karyawan.
- Grafik Dashboard tidak lagi menampilkan seri 'Laba Bersih' dengan rumus lama; grafik difokuskan ke Omzet, Kas Masuk, dan Jumlah Order.
- Tidak ada SQL baru.


## V113.0.108 — Simple Click Drawer Menu
- Side menu tidak lagi sticky di desktop.
- Default menu tertutup pada desktop, tablet, dan HP.
- Klik tombol menu di topbar untuk membuka drawer dari kiri.
- Klik X, area gelap di luar menu, atau pilih halaman untuk menutup kembali.
- Area konten sekarang memakai lebar penuh saat menu tertutup.
- Tidak ada SQL baru.


## V113.0.109 — Sticky Topbar + Page Header
- Topbar aplikasi sekarang sticky saat halaman di-scroll.
- Page header halaman utama juga sticky di bawah topbar.
- Judul halaman, tombol Tambah, tombol Kembali, dan action header tetap terlihat saat scroll ke bawah.
- Side menu tetap model click drawer dari V113.0.108.
- Tidak ada SQL baru.


## V113.0.112 — Professional Profit Loss Export
- Dibangun kembali dari baseline stabil V113.0.109.
- Export Laba Rugi XLS sekarang mempunyai 2 sheet: Ringkasan Laba Rugi dan Rincian.
- Angka uang memakai format Rupiah, bukan angka mentah.
- Ringkasan utama, subtotal, laba operasional, cadangan, dan laba setelah cadangan dibuat lebih jelas.
- Rincian dibagi menjadi Pendapatan, Biaya Operasional, Biaya Karyawan, dan Cadangan & Kewajiban.
- PDF Laba Rugi juga memakai layout ringkasan dan section yang lebih mudah dibaca.
- Tidak ada SQL baru.


## V113.0.113 — Finance Chart & Export Polish
- Periode Keuangan & Laporan dibuat satu baris ringkas agar tidak memakan ruang.
- Grafik Keuangan & Order sekarang mengikuti periode yang dipilih:
  Hari Ini = hari terpilih, 7 Hari = 7 hari, Bulan Ini/custom = seluruh rentang dibagi maksimal 7 kelompok.
- Generic Export XLS di seluruh aplikasi diperbarui dengan header HappyLaundry Babakan.
- Nilai uang otomatis diberi format Rp #,##0 berdasarkan nama kolom/komponen.
- Angka jumlah/qty memakai pemisah ribuan tanpa simbol Rp.
- Header tabel, ringkasan, lebar kolom, dan freeze pane dibuat lebih rapi.
- Generic PDF juga memakai brand HappyLaundry Babakan agar konsisten.
- Export Laba Rugi profesional dari V113.0.112 tetap dipertahankan.
- Tidak ada SQL baru.


## V113.0.114 — Sticky Brand Header
- Perubahan hanya pada topbar aplikasi paling atas.
- HappyLaundry diperbesar sebagai nama utama.
- Sistem Operasional Laundry diperkecil di bawah nama brand.
- Topbar tetap sticky saat scroll.
- PageHeader, tombol Kembali, Print, Export, action header, dan kartu tidak diubah.
- Tidak ada SQL baru.


## V113.0.115 — Fixed Brand Topbar
- Memperbaiki topbar V113.0.114 yang masih ikut scroll.
- Topbar paling atas sekarang fixed, sehingga selalu terlihat saat halaman di-scroll.
- Ruang 64px/60px disediakan pada main-content agar isi halaman tidak tertutup.
- HappyLaundry tetap besar; Sistem Operasional Laundry tetap kecil.
- PageHeader, tombol Kembali, Print, Export, dan kartu tetap normal/scroll biasa.
- Drawer menu tetap muncul di atas topbar.
- Tidak ada SQL baru.


## V113.0.117 — Accounting Structure Build Fix
- Rebuild dari V113.0.115 yang sebelumnya berhasil deploy.
- Menambahkan struktur akuntansi V113.0.116.
- Memperbaiki build error V113.0.116: ikon Banknote pada ProfitLossPage sudah di-import.
- Tidak ada SQL baru.


## V113.0.120 — Global Uniform Typography
- Dibangun dari V113.0.117.
- Menyeragamkan ukuran teks operasional di seluruh aplikasi ke 12px.
- Berlaku untuk Dashboard, Kasir, Order, Produksi, Pelanggan, Layanan, Stok, Supplier, Pembayaran, Keuangan & Laporan, Laba Rugi, Payroll, Backup, Pengaturan, tabel, tombol, input, modal, dan sidebar.
- Nilai Rupiah, judul kartu, label, tabel, catatan, badge, dan tombol tidak lagi meloncat-loncat ukurannya.
- Branding topbar tetap dikecualikan: HappyLaundry tetap besar dan Sistem Operasional Laundry tetap kecil sesuai permintaan sebelumnya.
- Tidak ada perubahan rumus, data, atau SQL.
