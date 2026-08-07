-- HappyLaundry Enterprise V107.0
-- Employee Access Control
-- Jalankan setelah SQL sebelumnya.

create extension if not exists pgcrypto;

create table if not exists public.v107_employee_access(
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text null,
  is_active boolean not null default true,

  dashboard boolean not null default true,
  cashier boolean not null default false,
  orders boolean not null default false,
  qr_center boolean not null default false,
  production boolean not null default false,
  customers boolean not null default false,
  services boolean not null default false,

  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists v107_employee_access_email_unique
on public.v107_employee_access(lower(email));

alter table public.v107_employee_access enable row level security;

-- Owner can manage employee records.
drop policy if exists v107_employee_owner_select on public.v107_employee_access;
create policy v107_employee_owner_select
on public.v107_employee_access
for select to authenticated
using (
  exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='owner'
  )
  or lower(email)=lower(coalesce(auth.jwt()->>'email',''))
);

drop policy if exists v107_employee_owner_insert on public.v107_employee_access;
create policy v107_employee_owner_insert
on public.v107_employee_access
for insert to authenticated
with check (
  exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='owner'
  )
);

drop policy if exists v107_employee_owner_update on public.v107_employee_access;
create policy v107_employee_owner_update
on public.v107_employee_access
for update to authenticated
using (
  exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='owner'
  )
)
with check (
  exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='owner'
  )
);

drop policy if exists v107_employee_owner_delete on public.v107_employee_access;
create policy v107_employee_owner_delete
on public.v107_employee_access
for delete to authenticated
using (
  exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='owner'
  )
);

notify pgrst,'reload schema';
