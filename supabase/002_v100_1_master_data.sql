-- HappyLaundry V100.1 Master Data
-- Jalankan setelah 001_v100_foundation.sql.
-- Tabel V100 dipisahkan agar tidak merusak tabel aplikasi lama.

create extension if not exists pgcrypto;

create table if not exists public.v100_customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid null,
  name text not null,
  phone text not null,
  address text null,
  notes text null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists v100_customers_name_idx on public.v100_customers using gin (to_tsvector('simple', name));
create index if not exists v100_customers_phone_idx on public.v100_customers(phone);

create table if not exists public.v100_services (
  id uuid primary key default gen_random_uuid(),
  store_id uuid null,
  name text not null,
  category text not null default 'Kiloan',
  unit text not null default 'kg' check (unit in ('kg','pcs','item')),
  price numeric(14,2) not null default 0 check (price >= 0),
  duration_hours integer not null default 24 check (duration_hours > 0),
  is_active boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists v100_services_name_unique on public.v100_services(lower(name));

alter table public.v100_customers enable row level security;
alter table public.v100_services enable row level security;

drop policy if exists v100_customers_authenticated_all on public.v100_customers;
create policy v100_customers_authenticated_all on public.v100_customers
for all to authenticated using (true) with check (true);

drop policy if exists v100_services_authenticated_all on public.v100_services;
create policy v100_services_authenticated_all on public.v100_services
for all to authenticated using (true) with check (true);

insert into public.v100_services(name, category, unit, price, duration_hours)
values
  ('Cuci Kering Lipat', 'Kiloan', 'kg', 8000, 48),
  ('Cuci Setrika', 'Kiloan', 'kg', 10000, 48),
  ('Setrika Saja', 'Kiloan', 'kg', 7000, 24),
  ('Express Cuci Setrika', 'Express', 'kg', 16000, 8),
  ('Bed Cover', 'Satuan', 'item', 30000, 48)
on conflict do nothing;

notify pgrst, 'reload schema';
