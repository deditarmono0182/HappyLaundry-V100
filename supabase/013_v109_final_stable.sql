-- HappyLaundry Enterprise V109 FINAL STABLE
-- Jalankan SETELAH 012_v109_internal_id_login.sql

create extension if not exists pgcrypto;

-- Extra permissions
alter table public.v109_users add column if not exists payments boolean not null default false;
alter table public.v109_users add column if not exists receivables boolean not null default false;
alter table public.v109_users add column if not exists finance boolean not null default false;
alter table public.v109_users add column if not exists cash boolean not null default false;
alter table public.v109_users add column if not exists reports boolean not null default false;
alter table public.v109_users add column if not exists backup boolean not null default false;
alter table public.v109_users add column if not exists settings boolean not null default false;

-- Login history
create table if not exists public.v109_login_history(
  id uuid primary key default gen_random_uuid(),
  employee_id uuid null references public.v109_users(id) on delete set null,
  login_id text not null,
  full_name text null,
  device text null,
  success boolean not null,
  reason text null,
  created_at timestamptz not null default now()
);

alter table public.v109_login_history enable row level security;
drop policy if exists v109_login_history_owner_select on public.v109_login_history;
create policy v109_login_history_owner_select
on public.v109_login_history for select to authenticated
using(public.v109_is_owner());

-- Audit log
create table if not exists public.v109_audit_log(
  id uuid primary key default gen_random_uuid(),
  employee_id uuid null references public.v109_users(id) on delete set null,
  login_id text null,
  full_name text null,
  action text not null,
  entity_type text null,
  entity_id text null,
  details text null,
  created_at timestamptz not null default now()
);

alter table public.v109_audit_log enable row level security;
drop policy if exists v109_audit_owner_select on public.v109_audit_log;
create policy v109_audit_owner_select
on public.v109_audit_log for select to authenticated
using(public.v109_is_owner());

-- Replace login with device + history.
drop function if exists public.v109_employee_login(text,text);

create or replace function public.v109_employee_login(
  p_login_id text,
  p_password text,
  p_device text default null
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
    insert into public.v109_login_history(login_id,device,success,reason)
    values(upper(btrim(p_login_id)),p_device,false,'ID Akun atau password salah');
    return query select false,null::text,'ID Akun atau password salah.'::text;
    return;
  end if;

  if not u.is_active then
    insert into public.v109_login_history(employee_id,login_id,full_name,device,success,reason)
    values(u.id,u.login_id,u.full_name,p_device,false,'Akun nonaktif');
    return query select false,null::text,'Akun karyawan tidak aktif.'::text;
    return;
  end if;

  if u.locked_until is not null and u.locked_until>now() then
    insert into public.v109_login_history(employee_id,login_id,full_name,device,success,reason)
    values(u.id,u.login_id,u.full_name,p_device,false,'Akun terkunci sementara');
    return query select false,null::text,'Akun terkunci sementara. Coba lagi beberapa menit.'::text;
    return;
  end if;

  if u.password_hash is null or crypt(p_password,u.password_hash)<>u.password_hash then
    update public.v109_users
    set failed_login_count=failed_login_count+1,
        locked_until=case when failed_login_count+1>=5 then now()+interval '15 minutes' else null end,
        updated_at=now()
    where id=u.id;

    insert into public.v109_login_history(employee_id,login_id,full_name,device,success,reason)
    values(u.id,u.login_id,u.full_name,p_device,false,'Password salah');

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

  insert into public.v109_login_history(employee_id,login_id,full_name,device,success,reason)
  values(u.id,u.login_id,u.full_name,p_device,true,'Login berhasil');

  return query select true,v_token,'Login valid.'::text;
end;
$$;

grant execute on function public.v109_employee_login(text,text,text) to anon,authenticated;

-- Current employee includes all permissions.
drop function if exists public.v109_current_employee();

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
  services boolean,
  payments boolean,
  receivables boolean,
  finance boolean,
  cash boolean,
  reports boolean,
  backup boolean,
  settings boolean
)
language sql
stable
security definer
set search_path=public
as $$
  select
    u.id,u.full_name,u.login_id,u.is_active,
    u.dashboard,u.cashier,u.orders,u.qr_center,u.production,u.customers,u.services,
    u.payments,u.receivables,u.finance,u.cash,u.reports,u.backup,u.settings
  from public.v109_users u
  where u.auth_uid=auth.uid() and u.is_active=true
  limit 1;
$$;

grant execute on function public.v109_current_employee() to authenticated;

-- Rebuild employee management RPCs with extra permissions.
drop function if exists public.v109_create_employee(
  text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean
);

create or replace function public.v109_create_employee(
  p_full_name text,p_login_id text,p_phone text,p_password text,p_is_active boolean,
  p_dashboard boolean,p_cashier boolean,p_orders boolean,p_qr_center boolean,
  p_production boolean,p_customers boolean,p_services boolean,
  p_payments boolean,p_receivables boolean,p_finance boolean,p_cash boolean,
  p_reports boolean,p_backup boolean,p_settings boolean
)
returns uuid
language plpgsql
security definer
set search_path=public,extensions
as $$
declare v_id uuid; v_login text:=upper(btrim(p_login_id));
begin
  if not public.v109_is_owner() then raise exception 'Hanya Owner yang dapat membuat akun karyawan.'; end if;
  if length(v_login)<3 then raise exception 'ID Akun minimal 3 karakter.'; end if;
  if length(coalesce(p_password,''))<8 then raise exception 'Password minimal 8 karakter.'; end if;
  if v_login !~ '^[A-Z0-9._-]+$' then raise exception 'ID Akun hanya boleh A-Z, 0-9, titik, underscore, atau minus.'; end if;

  insert into public.v109_users(
    full_name,login_id,phone,password_hash,is_active,
    dashboard,cashier,orders,qr_center,production,customers,services,
    payments,receivables,finance,cash,reports,backup,settings,created_by
  ) values(
    btrim(p_full_name),v_login,nullif(btrim(p_phone),''),
    crypt(p_password,gen_salt('bf',10)),p_is_active,
    p_dashboard,p_cashier,p_orders,p_qr_center,p_production,p_customers,p_services,
    p_payments,p_receivables,p_finance,p_cash,p_reports,p_backup,p_settings,auth.uid()
  ) returning id into v_id;

  insert into public.v109_audit_log(employee_id,login_id,full_name,action,entity_type,entity_id,details)
  values(v_id,v_login,btrim(p_full_name),'CREATE_EMPLOYEE','employee',v_id::text,'Owner membuat akun karyawan');

  return v_id;
exception when unique_violation then
  raise exception 'ID Akun % sudah digunakan.',v_login;
end;
$$;

grant execute on function public.v109_create_employee(
  text,text,text,text,boolean,
  boolean,boolean,boolean,boolean,boolean,boolean,boolean,
  boolean,boolean,boolean,boolean,boolean,boolean,boolean
) to authenticated;

drop function if exists public.v109_update_employee(
  uuid,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean
);

create or replace function public.v109_update_employee(
  p_id uuid,p_full_name text,p_login_id text,p_phone text,p_is_active boolean,
  p_dashboard boolean,p_cashier boolean,p_orders boolean,p_qr_center boolean,
  p_production boolean,p_customers boolean,p_services boolean,
  p_payments boolean,p_receivables boolean,p_finance boolean,p_cash boolean,
  p_reports boolean,p_backup boolean,p_settings boolean
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare v_login text:=upper(btrim(p_login_id));
begin
  if not public.v109_is_owner() then raise exception 'Hanya Owner yang dapat mengubah karyawan.'; end if;

  update public.v109_users set
    full_name=btrim(p_full_name),login_id=v_login,phone=nullif(btrim(p_phone),''),
    is_active=p_is_active,dashboard=p_dashboard,cashier=p_cashier,orders=p_orders,
    qr_center=p_qr_center,production=p_production,customers=p_customers,services=p_services,
    payments=p_payments,receivables=p_receivables,finance=p_finance,cash=p_cash,
    reports=p_reports,backup=p_backup,settings=p_settings,updated_at=now()
  where id=p_id;

  insert into public.v109_audit_log(employee_id,login_id,full_name,action,entity_type,entity_id,details)
  values(p_id,v_login,btrim(p_full_name),'UPDATE_EMPLOYEE','employee',p_id::text,'Owner memperbarui akun/hak akses');

  return found;
exception when unique_violation then
  raise exception 'ID Akun % sudah digunakan.',v_login;
end;
$$;

grant execute on function public.v109_update_employee(
  uuid,text,text,text,boolean,
  boolean,boolean,boolean,boolean,boolean,boolean,boolean,
  boolean,boolean,boolean,boolean,boolean,boolean,boolean
) to authenticated;

-- Generic activity logger for app modules.
create or replace function public.v109_log_activity(
  p_action text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_details text default null
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare u public.v109_users%rowtype;
begin
  select * into u from public.v109_users where auth_uid=auth.uid() limit 1;
  if not found then return false; end if;

  insert into public.v109_audit_log(
    employee_id,login_id,full_name,action,entity_type,entity_id,details
  ) values(
    u.id,u.login_id,u.full_name,p_action,p_entity_type,p_entity_id,p_details
  );
  return true;
end;
$$;

grant execute on function public.v109_log_activity(text,text,text,text) to authenticated;

notify pgrst,'reload schema';
