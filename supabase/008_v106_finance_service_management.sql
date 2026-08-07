-- HappyLaundry Enterprise V106.0
-- Finance & Service Management
-- Jalankan setelah SQL sebelumnya.

create extension if not exists pgcrypto;

-- 1) Service category
alter table public.v100_services
add column if not exists category text not null default 'Reguler';

create index if not exists v100_services_category_idx
on public.v100_services(category);

-- Seed categories are stored as text in service rows; no separate table needed.
-- Existing services automatically become "Reguler".

-- 2) Expense categories
create table if not exists public.v106_expense_categories(
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  group_name text not null default 'Operasional',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.v106_expense_categories(name,group_name) values
('Gaji Karyawan','Operasional'),
('Listrik','Operasional'),
('Air','Operasional'),
('Internet','Operasional'),
('Sewa','Operasional'),
('Pajak','Operasional'),
('BPJS','Operasional'),
('ATK','Operasional'),
('Deterjen','Laundry'),
('Pewangi','Laundry'),
('Plastik','Laundry'),
('Hanger','Laundry'),
('Label','Laundry'),
('Perawatan Mesin','Laundry'),
('BBM','Kendaraan'),
('Servis Kendaraan','Kendaraan'),
('Tol','Kendaraan'),
('Parkir','Kendaraan'),
('Facebook Ads','Marketing'),
('Google Ads','Marketing'),
('Banner','Marketing'),
('Brosur','Marketing'),
('Konsumsi','Lain-lain'),
('Kebersihan','Lain-lain'),
('Peralatan','Lain-lain'),
('Pengeluaran Lainnya','Lain-lain')
on conflict(name) do nothing;

alter table public.v106_expense_categories enable row level security;
drop policy if exists v106_expense_categories_authenticated_all on public.v106_expense_categories;
create policy v106_expense_categories_authenticated_all
on public.v106_expense_categories for all to authenticated using(true) with check(true);

-- 3) Expenses
create table if not exists public.v106_expenses(
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  category_id uuid null references public.v106_expense_categories(id) on delete set null,
  category_name text not null,
  amount numeric(14,2) not null check(amount>0),
  payment_method text not null default 'cash',
  description text null,
  reference text null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists v106_expenses_date_idx
on public.v106_expenses(expense_date desc);

alter table public.v106_expenses enable row level security;
drop policy if exists v106_expenses_authenticated_all on public.v106_expenses;
create policy v106_expenses_authenticated_all
on public.v106_expenses for all to authenticated using(true) with check(true);

-- 4) Expense view
create or replace view public.v106_expenses_view
with (security_invoker=true)
as
select
  e.id,e.expense_date,e.category_id,e.category_name,e.amount,
  e.payment_method,e.description,e.reference,e.created_at,
  c.group_name
from public.v106_expenses e
left join public.v106_expense_categories c on c.id=e.category_id;

grant select on public.v106_expenses_view to authenticated;

notify pgrst,'reload schema';
