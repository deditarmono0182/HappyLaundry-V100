-- HappyLaundry Enterprise V111.1
-- Bagi Hasil Gaji berdasarkan Kategori Layanan
-- Jalankan setelah 024_v111_0_attendance_payroll.sql

alter table public.v111_employee_payroll_settings
add column if not exists revenue_share_category text not null default 'Kiloan';

-- Normalisasi data lama agar setiap karyawan langsung mempunyai kategori.
update public.v111_employee_payroll_settings
set revenue_share_category='Kiloan'
where revenue_share_category is null
   or btrim(revenue_share_category)='';

notify pgrst,'reload schema';
