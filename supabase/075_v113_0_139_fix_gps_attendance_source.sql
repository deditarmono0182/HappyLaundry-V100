-- HappyLaundry: perbaikan gagal Absen Masuk GPS.
-- Fungsi SQL 070 menulis login_gps; constraint lama belum mengizinkannya.
-- Jalankan seluruh file di Supabase SQL Editor.
-- Tidak mengubah data absensi, saldo, jam kerja, radius GPS, atau hak akses.
begin;
alter table public.v111_attendance
  drop constraint if exists v111_attendance_source_check;
alter table public.v111_attendance
  add constraint v111_attendance_source_check
  check (attendance_source in ('manual','login','owner_override','qr_gps','login_gps'));
commit;
