-- HappyLaundry Enterprise V109.0
-- Internal ID Login + Password Hash
-- Jalankan SETELAH SQL V108 sebelumnya.
--
-- Karyawan tidak menggunakan email.
-- Password disimpan sebagai bcrypt hash via pgcrypto crypt().
-- Supabase Anonymous Auth hanya dipakai sebagai authenticated transport session
-- supaya RLS tabel operasional yang sudah ada tetap bekerja.

create extension if not exists pgcrypto;

create table if not exists public.v109_users(
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  login_id text not null,
  phone text null,
  password_hash text null,
  is_active boolean not null default true,

  dashboard boolean not null default true,
  cashier boolean not null default false,
  orders boolean not null default false,
  qr_center boolean not null default false,
  production boolean not null default false,
  customers boolean not null default false,
  services boolean not null default false,

  auth_uid uuid null,
  failed_login_count integer not null default 0,
  locked_until timestamptz null,
  last_login_at timestamptz null,
  last_logout_at timestamptz null,

  login_token_hash text null,
  login_token_expires_at timestamptz null,

  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists v109_users_login_id_unique
on public.v109_users(lower(login_id));

create unique index if not exists v109_users_auth_uid_unique
on public.v109_users(auth_uid)
where auth_uid is not null;

-- Migrate employee definitions from V107/V108.
insert into public.v109_users(
  full_name,login_id,phone,is_active,
  dashboard,cashier,orders,qr_center,production,customers,services,
  created_at,updated_at
)
select
  full_name,
  upper(login_id),
  phone,
  is_active,
  dashboard,cashier,orders,qr_center,production,customers,services,
  created_at,updated_at
from public.v107_employee_access
where login_id is not null
on conflict (lower(login_id)) do nothing;

alter table public.v109_users enable row level security;

-- Owner manages employee master data.
drop policy if exists v109_owner_select on public.v109_users;
create policy v109_owner_select
on public.v109_users
for select to authenticated
using(
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner')
  or auth_uid=auth.uid()
);

-- No direct insert/update/delete from browser. Use RPC functions below.

create or replace function public.v109_is_owner()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='owner'
  );
$$;

revoke all on function public.v109_is_owner() from public;
grant execute on function public.v109_is_owner() to authenticated;

-- Owner creates employee and hashes password server-side.
create or replace function public.v109_create_employee(
  p_full_name text,
  p_login_id text,
  p_phone text,
  p_password text,
  p_is_active boolean,
  p_dashboard boolean,
  p_cashier boolean,
  p_orders boolean,
  p_qr_center boolean,
  p_production boolean,
  p_customers boolean,
  p_services boolean
)
returns uuid
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_id uuid;
  v_login text:=upper(btrim(p_login_id));
begin
  if not public.v109_is_owner() then
    raise exception 'Hanya Owner yang dapat membuat akun karyawan.';
  end if;
  if length(v_login)<3 then raise exception 'ID Akun minimal 3 karakter.'; end if;
  if length(coalesce(p_password,''))<8 then raise exception 'Password minimal 8 karakter.'; end if;
  if v_login !~ '^[A-Z0-9._-]+$' then raise exception 'ID Akun hanya boleh A-Z, 0-9, titik, underscore, atau minus.'; end if;

  insert into public.v109_users(
    full_name,login_id,phone,password_hash,is_active,
    dashboard,cashier,orders,qr_center,production,customers,services,
    created_by
  ) values(
    btrim(p_full_name),v_login,nullif(btrim(p_phone),''),
    crypt(p_password,gen_salt('bf',10)),p_is_active,
    p_dashboard,p_cashier,p_orders,p_qr_center,p_production,p_customers,p_services,
    auth.uid()
  )
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'ID Akun % sudah digunakan.',v_login;
end;
$$;

grant execute on function public.v109_create_employee(
  text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean
) to authenticated;

create or replace function public.v109_update_employee(
  p_id uuid,
  p_full_name text,
  p_login_id text,
  p_phone text,
  p_is_active boolean,
  p_dashboard boolean,
  p_cashier boolean,
  p_orders boolean,
  p_qr_center boolean,
  p_production boolean,
  p_customers boolean,
  p_services boolean
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare v_login text:=upper(btrim(p_login_id));
begin
  if not public.v109_is_owner() then raise exception 'Hanya Owner yang dapat mengubah karyawan.'; end if;
  if length(v_login)<3 then raise exception 'ID Akun minimal 3 karakter.'; end if;

  update public.v109_users set
    full_name=btrim(p_full_name),
    login_id=v_login,
    phone=nullif(btrim(p_phone),''),
    is_active=p_is_active,
    dashboard=p_dashboard,
    cashier=p_cashier,
    orders=p_orders,
    qr_center=p_qr_center,
    production=p_production,
    customers=p_customers,
    services=p_services,
    updated_at=now()
  where id=p_id;

  return found;
exception
  when unique_violation then raise exception 'ID Akun % sudah digunakan.',v_login;
end;
$$;

grant execute on function public.v109_update_employee(
  uuid,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean
) to authenticated;

create or replace function public.v109_owner_reset_employee_password(
  p_employee_id uuid,
  p_new_password text
)
returns boolean
language plpgsql
security definer
set search_path=public,extensions
as $$
begin
  if not public.v109_is_owner() then raise exception 'Hanya Owner yang dapat reset password.'; end if;
  if length(coalesce(p_new_password,''))<8 then raise exception 'Password minimal 8 karakter.'; end if;

  update public.v109_users set
    password_hash=crypt(p_new_password,gen_salt('bf',10)),
    failed_login_count=0,
    locked_until=null,
    updated_at=now()
  where id=p_employee_id;

  return found;
end;
$$;

grant execute on function public.v109_owner_reset_employee_password(uuid,text) to authenticated;

create or replace function public.v109_set_employee_active(p_id uuid,p_active boolean)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.v109_is_owner() then raise exception 'Hanya Owner yang dapat mengubah status akun.'; end if;

  update public.v109_users
  set is_active=p_active,
      auth_uid=case when p_active then auth_uid else null end,
      updated_at=now()
  where id=p_id;

  return found;
end;
$$;

grant execute on function public.v109_set_employee_active(uuid,boolean) to authenticated;

-- LOGIN PUBLIC RPC
-- Validates ID/password. Five failures lock account for 15 minutes.
create or replace function public.v109_employee_login(
  p_login_id text,
  p_password text
)
returns table(ok boolean,login_token text,message text)
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  u public.v109_users%rowtype;
  v_token text;
begin
  select * into u
  from public.v109_users
  where lower(login_id)=lower(btrim(p_login_id))
  for update;

  if not found then
    return query select false,null::text,'ID Akun atau password salah.'::text;
    return;
  end if;

  if not u.is_active then
    return query select false,null::text,'Akun karyawan tidak aktif.'::text;
    return;
  end if;

  if u.locked_until is not null and u.locked_until>now() then
    return query select false,null::text,'Akun terkunci sementara. Coba lagi beberapa menit.'::text;
    return;
  end if;

  if u.password_hash is null or crypt(p_password,u.password_hash)<>u.password_hash then
    update public.v109_users
    set failed_login_count=failed_login_count+1,
        locked_until=case when failed_login_count+1>=5 then now()+interval '15 minutes' else null end,
        updated_at=now()
    where id=u.id;

    return query select false,null::text,'ID Akun atau password salah.'::text;
    return;
  end if;

  v_token=gen_random_uuid()::text;

  update public.v109_users
  set failed_login_count=0,
      locked_until=null,
      login_token_hash=encode(digest(v_token,'sha256'),'hex'),
      login_token_expires_at=now()+interval '2 minutes',
      updated_at=now()
  where id=u.id;

  return query select true,v_token,'Login valid.'::text;
end;
$$;

revoke all on function public.v109_employee_login(text,text) from public;
grant execute on function public.v109_employee_login(text,text) to anon,authenticated;

-- Bind validated login to a fresh anonymous authenticated session.
create or replace function public.v109_bind_employee_session(p_login_token text)
returns boolean
language plpgsql
security definer
set search_path=public,extensions
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sesi Supabase belum aktif.'; end if;

  select id into v_id
  from public.v109_users
  where login_token_hash=encode(digest(p_login_token,'sha256'),'hex')
    and login_token_expires_at>now()
    and is_active=true
  for update;

  if v_id is null then return false; end if;

  update public.v109_users
  set auth_uid=null
  where auth_uid=auth.uid() and id<>v_id;

  update public.v109_users
  set auth_uid=auth.uid(),
      login_token_hash=null,
      login_token_expires_at=null,
      last_login_at=now(),
      updated_at=now()
  where id=v_id;

  return true;
end;
$$;

grant execute on function public.v109_bind_employee_session(text) to authenticated;

create or replace function public.v109_current_employee()
returns table(
  id uuid,
  full_name text,
  login_id text,
  is_active boolean,
  dashboard boolean,
  cashier boolean,
  orders boolean,
  qr_center boolean,
  production boolean,
  customers boolean,
  services boolean
)
language sql
stable
security definer
set search_path=public
as $$
  select
    u.id,u.full_name,u.login_id,u.is_active,
    u.dashboard,u.cashier,u.orders,u.qr_center,u.production,u.customers,u.services
  from public.v109_users u
  where u.auth_uid=auth.uid() and u.is_active=true
  limit 1;
$$;

grant execute on function public.v109_current_employee() to authenticated;

create or replace function public.v109_employee_logout()
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.v109_users
  set last_logout_at=now(),
      auth_uid=null,
      updated_at=now()
  where auth_uid=auth.uid();
  return true;
end;
$$;

grant execute on function public.v109_employee_logout() to authenticated;

-- Clear stale one-time tokens.
update public.v109_users
set login_token_hash=null,login_token_expires_at=null
where login_token_expires_at<now();

notify pgrst,'reload schema';
