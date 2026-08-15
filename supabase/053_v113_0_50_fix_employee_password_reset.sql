-- HappyLaundry V113.0.50
-- SQL 053 - Fix Reset Password Karyawan
-- Jalankan di Supabase SQL Editor sebagai Owner proyek/database.
-- Tidak mengubah order, absensi, komisi, payroll, atau data transaksi.

begin;

-- Pastikan pgcrypto tersedia (dipakai untuk bcrypt hash).
create extension if not exists pgcrypto;

-- Ganti fungsi reset password dengan versi yang lebih defensif dan pesan error jelas.
create or replace function public.v109_owner_reset_employee_password(
  p_employee_id uuid,
  p_new_password text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_is_owner boolean := false;
  v_employee_exists boolean := false;
begin
  -- Harus ada session Supabase Auth aktif.
  if auth.uid() is null then
    raise exception 'Sesi login tidak valid. Silakan login ulang sebagai Owner.';
  end if;

  -- Cek Owner secara langsung agar tidak bergantung pada RPC helper lama.
  select exists(
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) = 'owner'
  ) into v_is_owner;

  if not v_is_owner then
    raise exception 'Hanya Owner yang dapat reset password karyawan.';
  end if;

  if p_employee_id is null then
    raise exception 'ID karyawan tidak valid.';
  end if;

  if length(coalesce(p_new_password, '')) < 8 then
    raise exception 'Password minimal 8 karakter.';
  end if;

  select exists(
    select 1
    from public.v109_users u
    where u.id = p_employee_id
  ) into v_employee_exists;

  if not v_employee_exists then
    raise exception 'Data karyawan tidak ditemukan.';
  end if;

  update public.v109_users
  set
    password_hash = crypt(p_new_password, gen_salt('bf', 10)),
    failed_login_count = 0,
    locked_until = null,
    login_token_hash = null,
    login_token_expires_at = null,
    updated_at = now()
  where id = p_employee_id;

  if not found then
    raise exception 'Reset password gagal: data karyawan tidak berhasil diperbarui.';
  end if;

  return true;
end;
$$;

-- Batasi pemanggilan: browser anonymous tidak boleh menjalankan reset.
revoke all on function public.v109_owner_reset_employee_password(uuid, text) from public;
revoke execute on function public.v109_owner_reset_employee_password(uuid, text) from anon;
grant execute on function public.v109_owner_reset_employee_password(uuid, text) to authenticated;

commit;

-- Setelah SQL berhasil:
-- 1) Logout lalu login kembali sebagai Owner di HappyLaundry.
-- 2) Karyawan -> pilih salah satu karyawan -> Reset Password.
-- 3) Gunakan password minimal 8 karakter, misalnya 123456Abc@
-- 4) Jika masih gagal, pesan error baru seharusnya lebih spesifik sehingga mudah didiagnosis.
