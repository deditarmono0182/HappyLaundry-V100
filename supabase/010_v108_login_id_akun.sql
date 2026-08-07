-- HappyLaundry Enterprise V108.0
-- Login Karyawan: ID Akun + Password
-- Jalankan SETELAH SQL 009.

alter table public.v107_employee_access
add column if not exists login_id text null;

-- Migrasi akun lama: pakai bagian sebelum @ sebagai ID awal bila login_id masih kosong.
update public.v107_employee_access
set login_id=upper(split_part(email,'@',1))
where (login_id is null or btrim(login_id)='') and email is not null;

alter table public.v107_employee_access
alter column login_id set not null;

create unique index if not exists v108_employee_login_id_unique
on public.v107_employee_access(lower(login_id));

-- Untuk akun baru V108, email internal Auth berbentuk:
-- kasir1@employee.happylaundry.local
-- Email ini tidak ditampilkan kepada karyawan.

notify pgrst,'reload schema';
