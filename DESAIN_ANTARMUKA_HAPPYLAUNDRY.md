# Standar tampilan HappyLaundry

Desain baku mulai V113.0.164. Perubahan berikutnya mengikuti standar ini agar pekerjaan berfokus pada data, performa, dan layanan operasional.

## Hierarki tulisan

| Elemen | Ukuran | Ketegasan |
| --- | --- | --- |
| Judul halaman | 21 px laptop / 19 px HP | Medium 500 |
| Judul bagian | 15 px | Medium 500 |
| Judul kartu | 14 px | Medium 500 |
| Nominal uang dan jumlah | 14 px | Normal 400, angka tabular |
| Isi, data tabel | 14 px | Normal 400 |
| Keterangan dan metadata | 12 px | Normal 400 |
| Tombol dan label formulir | 13 px | Medium 500 untuk tombol; normal untuk label |
| Isian formulir | 14 px laptop / 16 px HP | Normal 400 |

Isian 16 px di HP mencegah pembesaran layar otomatis pada Safari iPhone. Angka ringkasan tetap 14 px.
Keterangan harus lebih kecil dari judul dan tetap memiliki kontras yang cukup. Jangan gunakan angka besar sebagai dekorasi.

## Warna dan permukaan

- Biru untuk aksi utama, navigasi aktif, dan fokus keyboard.
- Hijau untuk berhasil, lunas, dan status positif.
- Kuning untuk peringatan yang perlu diperiksa.
- Merah untuk kesalahan, utang berlebih, atau tindakan berisiko.
- Latar aplikasi abu-abu kebiruan, panel putih, garis batas halus, bayangan ringan.
- Teks selalu menyebut status; jangan mengandalkan warna saja.

## Tata letak

- Konten maksimum 1360 px, berada di tengah pada laptop besar.
- Kartu ringkasan laptop memakai grid; HP memakai baris lebar yang disusun vertikal.
- Judul halaman berada sebelum tombol. Tombol boleh membungkus baris dan tidak boleh menimpa judul.
- Tabel lebar digulir di dalam wadahnya. Halaman utama tidak ikut melebar ke samping.
- Header modal dan tombol tutup dapat dijangkau; isi modal panjang dapat digulir.
- Tombol HP setidaknya 44 px. Mode Comfort/Compact/Ultra mengatur ruang, bukan mengubah hierarki angka.
- Drawer menu dan hak akses yang sudah ada dipertahankan.

## Cara mempertahankan desain

1. Aturan bersama berada di src/styles/professional.css dan dimuat terakhir oleh src/main.tsx.
2. Gunakan PageHeader, StatCard, Modal, primary-button, secondary-button, panel dan table-wrap yang sudah ada.
3. Fitur baru mengikuti ukuran, jarak, dan warna standar. Hindari menambah aturan global baru yang mengubah seluruh ukuran huruf.
4. Perubahan kebutuhan operasional dilakukan pada alur/data fitur tersebut tanpa mendesain ulang komponen bersama.
5. Sebelum rilis, periksa HP 320/390 px, tablet, laptop, formulir, data panjang, data kosong, dan status gagal/memuat.
6. Perubahan tampilan tidak boleh mengubah nominal, hak akses, status pembayaran, login, atau aturan absensi GPS.
