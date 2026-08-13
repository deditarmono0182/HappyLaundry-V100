-- HappyLaundry Enterprise V113.0.48
-- Koreksi Penanggung Jawab Order (Dikerjakan oleh + Kurir) khusus Owner.
-- Jalankan SEKALI setelah SQL 049, 050, dan 051.

create table if not exists public.v113_order_assignment_corrections(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.v100_orders(id) on delete cascade,
  old_worker_id uuid null references public.v109_users(id) on delete set null,
  new_worker_id uuid null references public.v109_users(id) on delete set null,
  old_courier_id uuid null references public.v109_users(id) on delete set null,
  new_courier_id uuid null references public.v109_users(id) on delete set null,
  reason text not null,
  changed_by uuid not null default auth.uid(),
  changed_at timestamptz not null default now()
);

create index if not exists v113_order_assignment_corrections_order_idx
  on public.v113_order_assignment_corrections(order_id,changed_at desc);

alter table public.v113_order_assignment_corrections enable row level security;

drop policy if exists v113_order_assignment_corrections_owner_select on public.v113_order_assignment_corrections;
create policy v113_order_assignment_corrections_owner_select
on public.v113_order_assignment_corrections for select to authenticated
using(public.v109_is_owner());

grant select on public.v113_order_assignment_corrections to authenticated;

create or replace function public.v113_correct_order_assignment(
  p_order_id uuid,
  p_worker_id uuid,
  p_courier_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_order public.v100_orders%rowtype;
  v_existing public.v113_order_commissions%rowtype;
  v_old_worker uuid;
  v_old_courier uuid;
  v_worker_percent numeric(7,3):=0;
  v_courier_percent numeric(7,3):=0;
  v_worker_earned timestamptz;
  v_courier_earned timestamptz;
  v_has_paid_payroll boolean:=false;
begin
  if not public.v109_is_owner() then
    raise exception 'Hanya Owner yang dapat mengoreksi penanggung jawab order.';
  end if;

  if coalesce(length(trim(p_reason)),0)<5 then
    raise exception 'Alasan koreksi minimal 5 karakter.';
  end if;

  select * into v_order from public.v100_orders where id=p_order_id for update;
  if not found then raise exception 'Order tidak ditemukan.'; end if;
  if v_order.status='cancelled' then raise exception 'Order dibatalkan tidak dapat dikoreksi.'; end if;

  select * into v_existing from public.v113_order_commissions where order_id=p_order_id for update;
  if found then
    v_old_worker:=v_existing.worker_id;
    v_old_courier:=v_existing.courier_id;

    -- Jika komisi lama sudah masuk ke periode payroll yang pernah dibayar, blok agar tidak menimbulkan selisih diam-diam.
    if v_existing.worker_earned_at is not null and v_old_worker is distinct from p_worker_id then
      select exists(
        select 1 from public.v113_payroll_payments pp
        where pp.employee_id=v_old_worker
          and pp.payroll_month=date_trunc('month',v_existing.worker_earned_at)::date
      ) into v_has_paid_payroll;
      if v_has_paid_payroll then
        raise exception 'Komisi pekerja lama sudah masuk periode gaji yang pernah dibayar. Koreksi harus diselesaikan manual pada payroll.';
      end if;
    end if;

    if v_existing.courier_earned_at is not null and v_old_courier is distinct from p_courier_id then
      select exists(
        select 1 from public.v113_payroll_payments pp
        where pp.employee_id=v_old_courier
          and pp.payroll_month=date_trunc('month',v_existing.courier_earned_at)::date
      ) into v_has_paid_payroll;
      if v_has_paid_payroll then
        raise exception 'Komisi kurir lama sudah masuk periode gaji yang pernah dibayar. Koreksi harus diselesaikan manual pada payroll.';
      end if;
    end if;
  else
    v_old_worker:=null;
    v_old_courier:=null;
  end if;

  if p_worker_id is not null then
    select coalesce(production_percent,0) into v_worker_percent
    from public.v113_employee_commission_settings where employee_id=p_worker_id;
    v_worker_percent:=coalesce(v_worker_percent,0);
  end if;

  if p_courier_id is not null then
    select coalesce(courier_percent,0) into v_courier_percent
    from public.v113_employee_commission_settings where employee_id=p_courier_id;
    v_courier_percent:=coalesce(v_courier_percent,0);
  end if;

  if v_order.status='completed' and v_order.payment_status='paid' then
    if p_worker_id is not null and v_worker_percent>0 then
      v_worker_earned:=case when v_existing.worker_id is not distinct from p_worker_id then v_existing.worker_earned_at else now() end;
      v_worker_earned:=coalesce(v_worker_earned,now());
    end if;
    if p_courier_id is not null and v_courier_percent>0 then
      v_courier_earned:=case when v_existing.courier_id is not distinct from p_courier_id then v_existing.courier_earned_at else now() end;
      v_courier_earned:=coalesce(v_courier_earned,now());
    end if;
  end if;

  insert into public.v113_order_commissions(
    order_id,worker_id,worker_percent,worker_amount,worker_earned_at,
    courier_id,courier_percent,courier_amount,courier_earned_at,
    base_amount,updated_at
  ) values (
    p_order_id,p_worker_id,v_worker_percent,round(coalesce(v_order.total,0)*v_worker_percent/100,2),v_worker_earned,
    p_courier_id,v_courier_percent,round(coalesce(v_order.total,0)*v_courier_percent/100,2),v_courier_earned,
    coalesce(v_order.total,0),now()
  )
  on conflict(order_id) do update set
    worker_id=excluded.worker_id,
    worker_percent=excluded.worker_percent,
    worker_amount=excluded.worker_amount,
    worker_earned_at=excluded.worker_earned_at,
    courier_id=excluded.courier_id,
    courier_percent=excluded.courier_percent,
    courier_amount=excluded.courier_amount,
    courier_earned_at=excluded.courier_earned_at,
    base_amount=excluded.base_amount,
    updated_at=now();

  insert into public.v113_order_assignment_corrections(
    order_id,old_worker_id,new_worker_id,old_courier_id,new_courier_id,reason,changed_by
  ) values (
    p_order_id,v_old_worker,p_worker_id,v_old_courier,p_courier_id,trim(p_reason),auth.uid()
  );
end;
$$;

grant execute on function public.v113_correct_order_assignment(uuid,uuid,uuid,text) to authenticated;
notify pgrst,'reload schema';
