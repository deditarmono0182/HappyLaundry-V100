-- HappyLaundry Enterprise V111.2
-- Multi-category Revenue Share per Employee
-- Jalankan setelah SQL 024 dan 025.

create table if not exists public.v111_employee_revenue_shares(
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.v109_users(id) on delete cascade,
  category text not null,
  share_percent numeric(7,3) not null default 0
    check(share_percent>=0 and share_percent<=100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(employee_id,category)
);

alter table public.v111_employee_revenue_shares enable row level security;

drop policy if exists v111_employee_revenue_shares_owner_all on public.v111_employee_revenue_shares;
create policy v111_employee_revenue_shares_owner_all
on public.v111_employee_revenue_shares
for all to authenticated
using(exists(
  select 1 from public.profiles p
  where p.id=auth.uid() and p.role='owner'
))
with check(exists(
  select 1 from public.profiles p
  where p.id=auth.uid() and p.role='owner'
));

grant select,insert,update,delete on public.v111_employee_revenue_shares to authenticated;

-- Migrasi pengaturan single-category dari V111.1 ke tabel multi-category.
insert into public.v111_employee_revenue_shares(
  employee_id,category,share_percent
)
select
  employee_id,
  coalesce(nullif(btrim(revenue_share_category),''),'Kiloan'),
  coalesce(revenue_share_percent,0)
from public.v111_employee_payroll_settings
where coalesce(revenue_share_percent,0)>0
on conflict(employee_id,category)
do update set
  share_percent=excluded.share_percent,
  updated_at=now();

notify pgrst,'reload schema';
