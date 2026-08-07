-- HappyLaundry Enterprise V110.4
-- Finance Revenue Sharing by Service Category
-- Jalankan setelah SQL sebelumnya.

create extension if not exists pgcrypto;

create table if not exists public.v110_revenue_share_settings(
  id uuid primary key default gen_random_uuid(),
  category text not null,
  share_percent numeric(7,2) not null default 0
    check(share_percent>=0 and share_percent<=100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists v110_revenue_share_category_unique
on public.v110_revenue_share_settings(lower(category));

-- Seed kategori umum. Persentase awal 0%, Owner bebas mengubahnya.
insert into public.v110_revenue_share_settings(category,share_percent) values
('Reguler',0),
('Express',0),
('Premium',0),
('Same Day',0),
('Super Express',0),
('Bed Cover',0),
('Dry Cleaning',0),
('Sepatu',0),
('Tas',0),
('Boneka',0),
('Hotel',0),
('Restoran',0),
('Corporate',0),
('Satuan',0)
on conflict do nothing;

alter table public.v110_revenue_share_settings enable row level security;

drop policy if exists v110_revenue_share_read on public.v110_revenue_share_settings;
create policy v110_revenue_share_read
on public.v110_revenue_share_settings
for select to authenticated
using(true);

drop policy if exists v110_revenue_share_owner_insert on public.v110_revenue_share_settings;
create policy v110_revenue_share_owner_insert
on public.v110_revenue_share_settings
for insert to authenticated
with check(
  exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='owner'
  )
);

drop policy if exists v110_revenue_share_owner_update on public.v110_revenue_share_settings;
create policy v110_revenue_share_owner_update
on public.v110_revenue_share_settings
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

drop policy if exists v110_revenue_share_owner_delete on public.v110_revenue_share_settings;
create policy v110_revenue_share_owner_delete
on public.v110_revenue_share_settings
for delete to authenticated
using(
  exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='owner'
  )
);

notify pgrst,'reload schema';
