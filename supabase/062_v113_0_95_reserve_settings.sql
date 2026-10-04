-- HappyLaundry V113.0.95
-- Cadangan & Kewajiban: Penyusutan, THR, Kesehatan, Tak Terduga
-- Jalankan setelah SQL 061.

create table if not exists public.v113095_reserve_settings(
  reserve_type text primary key
    check(reserve_type in ('depreciation','thr','health','unexpected')),
  label text not null,
  method text not null default 'fixed'
    check(method in ('fixed','percent_revenue')),
  monthly_amount numeric(14,2) not null default 0
    check(monthly_amount>=0),
  revenue_percent numeric(8,4) not null default 0
    check(revenue_percent>=0 and revenue_percent<=100),
  is_active boolean not null default false,
  note text,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

insert into public.v113095_reserve_settings
  (reserve_type,label,method,monthly_amount,revenue_percent,is_active)
values
  ('depreciation','Penyusutan Peralatan','fixed',0,0,false),
  ('thr','Cadangan THR','fixed',0,0,false),
  ('health','Cadangan Kesehatan Karyawan','fixed',0,0,false),
  ('unexpected','Cadangan Tak Terduga','percent_revenue',0,2,false)
on conflict(reserve_type) do nothing;

alter table public.v113095_reserve_settings enable row level security;

drop policy if exists v113095_reserve_owner_select on public.v113095_reserve_settings;
drop policy if exists v113095_reserve_owner_insert on public.v113095_reserve_settings;
drop policy if exists v113095_reserve_owner_update on public.v113095_reserve_settings;
drop policy if exists v113095_reserve_owner_delete on public.v113095_reserve_settings;

create policy v113095_reserve_owner_select
on public.v113095_reserve_settings
for select to authenticated
using(public.v109_is_owner());

create policy v113095_reserve_owner_insert
on public.v113095_reserve_settings
for insert to authenticated
with check(public.v109_is_owner());

create policy v113095_reserve_owner_update
on public.v113095_reserve_settings
for update to authenticated
using(public.v109_is_owner())
with check(public.v109_is_owner());

create policy v113095_reserve_owner_delete
on public.v113095_reserve_settings
for delete to authenticated
using(public.v109_is_owner());

grant select,insert,update,delete on public.v113095_reserve_settings to authenticated;

notify pgrst,'reload schema';
