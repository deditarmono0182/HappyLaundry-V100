-- HappyLaundry Enterprise V111.0
-- Absensi & Penggajian Karyawan
-- Jalankan setelah SQL V110.8/V110.7.5 sebelumnya.

create table if not exists public.v111_attendance(
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.v109_users(id) on delete cascade,
  attendance_date date not null,
  status text not null check(status in('present','permission','sick','absent')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(employee_id,attendance_date)
);

create table if not exists public.v111_employee_payroll_settings(
  employee_id uuid primary key references public.v109_users(id) on delete cascade,
  attendance_rate numeric(14,2) not null default 0 check(attendance_rate>=0),
  monthly_allowance numeric(14,2) not null default 0 check(monthly_allowance>=0),
  revenue_share_percent numeric(7,3) not null default 0 check(revenue_share_percent>=0 and revenue_share_percent<=100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v111_payroll_adjustments(
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.v109_users(id) on delete cascade,
  payroll_month date not null,
  bonus numeric(14,2) not null default 0 check(bonus>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(employee_id,payroll_month),
  check(extract(day from payroll_month)=1)
);

alter table public.v111_attendance enable row level security;
alter table public.v111_employee_payroll_settings enable row level security;
alter table public.v111_payroll_adjustments enable row level security;

-- Owner-only because payroll contains confidential compensation data.
drop policy if exists v111_attendance_owner_all on public.v111_attendance;
create policy v111_attendance_owner_all
on public.v111_attendance
for all to authenticated
using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner'))
with check(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner'));

drop policy if exists v111_payroll_settings_owner_all on public.v111_employee_payroll_settings;
create policy v111_payroll_settings_owner_all
on public.v111_employee_payroll_settings
for all to authenticated
using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner'))
with check(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner'));

drop policy if exists v111_payroll_adjustments_owner_all on public.v111_payroll_adjustments;
create policy v111_payroll_adjustments_owner_all
on public.v111_payroll_adjustments
for all to authenticated
using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner'))
with check(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner'));

grant select,insert,update,delete on public.v111_attendance to authenticated;
grant select,insert,update,delete on public.v111_employee_payroll_settings to authenticated;
grant select,insert,update,delete on public.v111_payroll_adjustments to authenticated;

notify pgrst,'reload schema';
