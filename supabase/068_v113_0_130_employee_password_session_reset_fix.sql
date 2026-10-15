-- HappyLaundry V113.0.130
-- SQL 068 - Employee Password & Session Reset Fix
-- Jalankan di Supabase SQL Editor.
-- Tujuan: reset password sekaligus memutus binding session lama karyawan.
-- Aman untuk order, absensi, komisi, payroll, dan transaksi.

begin;

create extension if not exists pgcrypto;

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
  v_login_id text;
  v_full_name text;
begin
  if auth.uid() is null then
    raise exception 'Sesi login tidak valid. Silakan login ulang sebagai Owner.';
  end if;

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
    select 1 from public.v109_users u where u.id = p_employee_id
  ) into v_employee_exists;

  if not v_employee_exists then
    raise exception 'Data karyawan tidak ditemukan.';
  end if;

  select login_id, full_name
  into v_login_id, v_full_name
  from public.v109_users
  where id = p_employee_id;

  update public.v109_users
  set
    password_hash = crypt(p_new_password, gen_salt('bf', 10)),
    failed_login_count = 0,
    locked_until = null,
    login_token_hash = null,
    login_token_expires_at = null,
    auth_uid = null,
    last_logout_at = now(),
    updated_at = now()
  where id = p_employee_id;

  if not found then
    raise exception 'Reset password gagal: data karyawan tidak berhasil diperbarui.';
  end if;

  if to_regclass('public.v109_audit_log') is not null then
    insert into public.v109_audit_log(
      employee_id, login_id, full_name, action, entity_type, entity_id, details
    )
    values(
      p_employee_id,
      v_login_id,
      v_full_name,
      'RESET_EMPLOYEE_PASSWORD_SESSION',
      'employee',
      p_employee_id::text,
      'Owner reset password sekaligus memutus binding session lama karyawan.'
    );
  end if;

  return true;
end;
$$;

revoke all on function public.v109_owner_reset_employee_password(uuid, text) from public;
revoke execute on function public.v109_owner_reset_employee_password(uuid, text) from anon;
grant execute on function public.v109_owner_reset_employee_password(uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
