-- HappyLaundry Enterprise V113.0
-- Dashboard Laba & Target Bisnis
-- Jalankan sekali di Supabase SQL Editor.

create table if not exists public.v113_business_targets(
  id uuid primary key default gen_random_uuid(),
  month_start date not null unique,
  revenue_target numeric(14,2) not null default 0 check(revenue_target>=0),
  profit_target numeric(14,2) not null default 0 check(profit_target>=0),
  order_target integer not null default 0 check(order_target>=0),
  note text null,
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v113_month_start_first_day check(extract(day from month_start)=1)
);

create index if not exists v113_business_targets_month_idx
on public.v113_business_targets(month_start desc);

alter table public.v113_business_targets enable row level security;

-- Semua sesi authenticated boleh SELECT agar aplikasi tidak error,
-- tetapi halaman V113 tetap hanya ditampilkan untuk Owner.
drop policy if exists v113_business_targets_authenticated_select on public.v113_business_targets;
create policy v113_business_targets_authenticated_select
on public.v113_business_targets
for select to authenticated
using(true);

-- Hanya akun Owner pada tabel profiles yang boleh membuat / mengubah / menghapus target.
drop policy if exists v113_business_targets_owner_insert on public.v113_business_targets;
create policy v113_business_targets_owner_insert
on public.v113_business_targets
for insert to authenticated
with check(
  exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='owner'
  )
);

drop policy if exists v113_business_targets_owner_update on public.v113_business_targets;
create policy v113_business_targets_owner_update
on public.v113_business_targets
for update to authenticated
using(
  exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='owner'
  )
)
with check(
  exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='owner'
  )
);

drop policy if exists v113_business_targets_owner_delete on public.v113_business_targets;
create policy v113_business_targets_owner_delete
on public.v113_business_targets
for delete to authenticated
using(
  exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='owner'
  )
);

-- Isi created_by / updated_by otomatis.
create or replace function public.v113_business_target_audit()
returns trigger
language plpgsql
security invoker
set search_path=public
as $$
begin
  if tg_op='INSERT' then
    new.created_by:=coalesce(new.created_by,auth.uid());
    new.created_at:=coalesce(new.created_at,now());
  end if;
  new.updated_by:=auth.uid();
  new.updated_at:=now();
  return new;
end $$;

drop trigger if exists trg_v113_business_target_audit on public.v113_business_targets;
create trigger trg_v113_business_target_audit
before insert or update on public.v113_business_targets
for each row execute function public.v113_business_target_audit();

grant select,insert,update,delete on public.v113_business_targets to authenticated;

notify pgrst,'reload schema';
