-- HappyLaundry V113.0.72 - Kas Bon Karyawan + Gaji Saya (Bagian A)
-- Jalankan setelah SQL 058.

create table if not exists public.v113072_employee_cash_advances(
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.v109_users(id) on delete cascade,
  amount numeric(14,2) not null check(amount>0),
  remaining_amount numeric(14,2) not null check(remaining_amount>=0),
  note text,
  issued_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists v113072_cash_adv_employee_idx
  on public.v113072_employee_cash_advances(employee_id,issued_at desc);

create table if not exists public.v113072_cash_advance_deductions(
  id uuid primary key default gen_random_uuid(),
  cash_advance_id uuid not null references public.v113072_employee_cash_advances(id) on delete cascade,
  employee_id uuid not null references public.v109_users(id) on delete cascade,
  payroll_month date not null,
  amount numeric(14,2) not null check(amount>0),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check(extract(day from payroll_month)=1)
);

create index if not exists v113072_cash_ded_employee_month_idx
  on public.v113072_cash_advance_deductions(employee_id,payroll_month,created_at desc);

alter table public.v113072_employee_cash_advances enable row level security;
alter table public.v113072_cash_advance_deductions enable row level security;

drop policy if exists v113072_cash_adv_owner_all on public.v113072_employee_cash_advances;
create policy v113072_cash_adv_owner_all
on public.v113072_employee_cash_advances for all to authenticated
using(public.v109_is_owner()) with check(public.v109_is_owner());

drop policy if exists v113072_cash_ded_owner_all on public.v113072_cash_advance_deductions;
create policy v113072_cash_ded_owner_all
on public.v113072_cash_advance_deductions for all to authenticated
using(public.v109_is_owner()) with check(public.v109_is_owner());

grant select,insert,update,delete on public.v113072_employee_cash_advances to authenticated;
grant select,insert,update,delete on public.v113072_cash_advance_deductions to authenticated;

notify pgrst,'reload schema';
