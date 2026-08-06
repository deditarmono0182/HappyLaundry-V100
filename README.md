# HappyLaundry Enterprise V104.2.2 QR Scanner

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
