-- HappyLaundry V113.0.45 - Payroll Payment Status & History
-- Jalankan sekali di Supabase SQL Editor sebelum deploy V113.0.45.

create table if not exists public.v113_payroll_payments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null,
  payroll_month date not null,
  amount numeric(14,2) not null check (amount > 0),
  payment_method text not null default 'Transfer',
  note text,
  paid_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists v113_payroll_payments_employee_month_idx
  on public.v113_payroll_payments(employee_id,payroll_month,paid_at desc);

alter table public.v113_payroll_payments enable row level security;

drop policy if exists v113_payroll_payments_owner_select on public.v113_payroll_payments;
create policy v113_payroll_payments_owner_select
on public.v113_payroll_payments for select to authenticated
using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner'));

drop policy if exists v113_payroll_payments_owner_insert on public.v113_payroll_payments;
create policy v113_payroll_payments_owner_insert
on public.v113_payroll_payments for insert to authenticated
with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner'));

-- Riwayat pembayaran dibuat append-only dari aplikasi agar bukti pembayaran tidak mudah berubah/hilang.
grant select,insert on public.v113_payroll_payments to authenticated;

notify pgrst, 'reload schema';
