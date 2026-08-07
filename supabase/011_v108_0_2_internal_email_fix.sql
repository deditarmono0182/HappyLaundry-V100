-- HappyLaundry Enterprise V108.0.2
-- Internal Email Domain Fix
-- Jalankan SETELAH 010_v108_login_id_akun.sql.

-- Supabase menolak domain .local pada signUp.
-- Email internal V108 sekarang memakai domain valid:
-- IDAKUN@employee.happylaundry.app

update public.v107_employee_access
set email=lower(login_id) || '@employee.happylaundry.app',
    updated_at=now()
where email like '%@employee.happylaundry.local'
   or email is null
   or btrim(email)='';

notify pgrst,'reload schema';
