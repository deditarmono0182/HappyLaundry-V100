-- HappyLaundry Enterprise V113.0.100
-- Koreksi Team Pengerjaan & Team Kurir dari halaman Order.
-- Jalankan setelah SQL 064.

create table if not exists public.v113100_order_team_corrections(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.v100_orders(id) on delete cascade,
  old_production_ids uuid[] not null default array[]::uuid[],
  new_production_ids uuid[] not null default array[]::uuid[],
  old_courier_ids uuid[] not null default array[]::uuid[],
  new_courier_ids uuid[] not null default array[]::uuid[],
  reason text not null,
  changed_by uuid not null default auth.uid(),
  changed_at timestamptz not null default now()
);

create index if not exists v113100_team_corrections_order_idx
  on public.v113100_order_team_corrections(order_id,changed_at desc);

alter table public.v113100_order_team_corrections enable row level security;

drop policy if exists v113100_team_corrections_owner_select on public.v113100_order_team_corrections;
create policy v113100_team_corrections_owner_select
on public.v113100_order_team_corrections
for select to authenticated
using(public.v109_is_owner());

grant select on public.v113100_order_team_corrections to authenticated;

create or replace function public.v113100_owner_correct_order_team(
  p_order_id uuid,
  p_production_ids uuid[] default array[]::uuid[],
  p_courier_ids uuid[] default array[]::uuid[],
  p_reason text default ''
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_old_production uuid[]:=array[]::uuid[];
  v_old_courier uuid[]:=array[]::uuid[];
  v_new_production uuid[]:=array[]::uuid[];
  v_new_courier uuid[]:=array[]::uuid[];
  v_primary_worker uuid;
  v_primary_courier uuid;
  v_paid_locked boolean:=false;
  v_worker_earned timestamptz;
  v_courier_earned timestamptz;
begin
  if not public.v109_is_owner() then
    raise exception 'Hanya Owner yang dapat mengoreksi team order.';
  end if;

  if coalesce(length(trim(p_reason)),0)<5 then
    raise exception 'Alasan koreksi minimal 5 karakter.';
  end if;

  -- Normalisasi array, hilangkan null/duplikat tetapi pertahankan urutan.
  select coalesce(array_agg(employee_id order by first_pos),array[]::uuid[])
  into v_new_production
  from (
    select employee_id,min(pos) as first_pos
    from unnest(coalesce(p_production_ids,array[]::uuid[])) with ordinality as x(employee_id,pos)
    where employee_id is not null
    group by employee_id
  ) q;

  select coalesce(array_agg(employee_id order by first_pos),array[]::uuid[])
  into v_new_courier
  from (
    select employee_id,min(pos) as first_pos
    from unnest(coalesce(p_courier_ids,array[]::uuid[])) with ordinality as x(employee_id,pos)
    where employee_id is not null
    group by employee_id
  ) q;

  v_primary_worker:=case when coalesce(array_length(v_new_production,1),0)>0 then v_new_production[1] else null end;
  v_primary_courier:=case when coalesce(array_length(v_new_courier,1),0)>0 then v_new_courier[1] else null end;

  -- Team lama; fallback ke assignment lama jika order belum pernah memakai team.
  select coalesce(array_agg(employee_id order by is_primary desc,created_at),array[]::uuid[])
  into v_old_production
  from public.v113097_order_commission_members
  where order_id=p_order_id and commission_type='production';

  if coalesce(array_length(v_old_production,1),0)=0 then
    select case when worker_id is null then array[]::uuid[] else array[worker_id] end
    into v_old_production
    from public.v113_order_commissions
    where order_id=p_order_id;
    v_old_production:=coalesce(v_old_production,array[]::uuid[]);
  end if;

  select coalesce(array_agg(employee_id order by is_primary desc,created_at),array[]::uuid[])
  into v_old_courier
  from public.v113097_order_commission_members
  where order_id=p_order_id and commission_type='courier';

  if coalesce(array_length(v_old_courier,1),0)=0 then
    select case when courier_id is null then array[]::uuid[] else array[courier_id] end
    into v_old_courier
    from public.v113_order_commissions
    where order_id=p_order_id;
    v_old_courier:=coalesce(v_old_courier,array[]::uuid[]);
  end if;

  -- Jangan hapus anggota team yang komisinya sudah masuk periode gaji yang pernah dibayar.
  select exists(
    select 1
    from public.v113097_order_commission_members m
    join public.v113_payroll_payments pp
      on pp.employee_id=m.employee_id
     and pp.payroll_month=date_trunc('month',m.earned_at)::date
    where m.order_id=p_order_id
      and m.commission_type='production'
      and m.earned_at is not null
      and not (m.employee_id=any(v_new_production))
  ) into v_paid_locked;

  if v_paid_locked then
    raise exception 'Ada komisi anggota team produksi yang sudah masuk periode gaji yang pernah dibayar. Koreksi harus diselesaikan manual pada payroll.';
  end if;

  select exists(
    select 1
    from public.v113097_order_commission_members m
    join public.v113_payroll_payments pp
      on pp.employee_id=m.employee_id
     and pp.payroll_month=date_trunc('month',m.earned_at)::date
    where m.order_id=p_order_id
      and m.commission_type='courier'
      and m.earned_at is not null
      and not (m.employee_id=any(v_new_courier))
  ) into v_paid_locked;

  if v_paid_locked then
    raise exception 'Ada komisi anggota team kurir yang sudah masuk periode gaji yang pernah dibayar. Koreksi harus diselesaikan manual pada payroll.';
  end if;

  -- Koreksi primary menggunakan proteksi payroll lama + audit assignment lama.
  perform public.v113_correct_order_assignment(
    p_order_id,
    v_primary_worker,
    v_primary_courier,
    trim(p_reason)
  );

  -- Lalu bentuk team baru dalam transaksi yang sama.
  perform public.v113097_set_order_commission_team(
    p_order_id,
    v_new_production,
    v_new_courier
  );

  -- Samakan earned_at anggota team dengan earned_at primary agar tetap masuk periode payroll yang benar.
  select worker_earned_at,courier_earned_at
  into v_worker_earned,v_courier_earned
  from public.v113_order_commissions
  where order_id=p_order_id;

  if v_worker_earned is not null then
    update public.v113097_order_commission_members
    set earned_at=v_worker_earned,updated_at=now()
    where order_id=p_order_id and commission_type='production';
  end if;

  if v_courier_earned is not null then
    update public.v113097_order_commission_members
    set earned_at=v_courier_earned,updated_at=now()
    where order_id=p_order_id and commission_type='courier';
  end if;

  insert into public.v113100_order_team_corrections(
    order_id,old_production_ids,new_production_ids,old_courier_ids,new_courier_ids,reason,changed_by
  ) values (
    p_order_id,v_old_production,v_new_production,v_old_courier,v_new_courier,trim(p_reason),auth.uid()
  );
end;
$$;

grant execute on function public.v113100_owner_correct_order_team(uuid,uuid[],uuid[],text) to authenticated;

notify pgrst,'reload schema';
