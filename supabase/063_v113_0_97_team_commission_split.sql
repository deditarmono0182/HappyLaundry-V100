-- HappyLaundry Enterprise V113.0.97
-- Team Commission Split: beberapa pekerja / kurir dalam satu order.
-- Default pembagian: rata berdasarkan total komisi penanggung jawab utama.
-- Jalankan setelah SQL 062.

create table if not exists public.v113097_order_commission_members(
  order_id uuid not null references public.v100_orders(id) on delete cascade,
  commission_type text not null check(commission_type in ('production','courier')),
  employee_id uuid not null references public.v109_users(id) on delete cascade,
  is_primary boolean not null default false,
  total_percent numeric(7,3) not null default 0 check(total_percent>=0 and total_percent<=100),
  share_percent numeric(7,3) not null default 0 check(share_percent>=0 and share_percent<=100),
  base_amount numeric(14,2) not null default 0,
  amount numeric(14,2) not null default 0,
  earned_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(order_id,commission_type,employee_id)
);

create index if not exists v113097_commission_members_employee_idx
  on public.v113097_order_commission_members(employee_id,commission_type,earned_at);

alter table public.v113097_order_commission_members enable row level security;

drop policy if exists v113097_commission_members_select on public.v113097_order_commission_members;
create policy v113097_commission_members_select
on public.v113097_order_commission_members
for select to authenticated
using(true);

grant select on public.v113097_order_commission_members to authenticated;

create or replace function public.v113097_set_order_commission_team(
  p_order_id uuid,
  p_production_ids uuid[] default array[]::uuid[],
  p_courier_ids uuid[] default array[]::uuid[]
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_order public.v100_orders%rowtype;
  v_type text;
  v_ids uuid[];
  v_primary uuid;
  v_total_percent numeric(7,3):=0;
  v_count integer:=0;
  v_share numeric(7,3):=0;
  v_employee uuid;
  v_amount numeric(14,2):=0;
  v_earned timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Login diperlukan.';
  end if;

  select * into v_order from public.v100_orders where id=p_order_id;
  if not found then raise exception 'Order tidak ditemukan.'; end if;

  foreach v_type in array array['production','courier'] loop
    if v_type='production' then
      select coalesce(array_agg(distinct x),array[]::uuid[])
      into v_ids
      from unnest(coalesce(p_production_ids,array[]::uuid[])) x
      where x is not null;
    else
      select coalesce(array_agg(distinct x),array[]::uuid[])
      into v_ids
      from unnest(coalesce(p_courier_ids,array[]::uuid[])) x
      where x is not null;
    end if;

    delete from public.v113097_order_commission_members
    where order_id=p_order_id and commission_type=v_type;

    v_count:=coalesce(array_length(v_ids,1),0);
    if v_count=0 then continue; end if;

    v_primary:=v_ids[1];

    if v_type='production' then
      select coalesce(production_percent,0) into v_total_percent
      from public.v113_employee_commission_settings where employee_id=v_primary;
    else
      select coalesce(courier_percent,0) into v_total_percent
      from public.v113_employee_commission_settings where employee_id=v_primary;
    end if;
    v_total_percent:=coalesce(v_total_percent,0);
    v_share:=round(100.0/v_count,3);

    if v_type='production'
       and v_order.status='completed'
       and v_order.payment_status='paid' then
      v_earned:=now();
    elsif v_type='courier'
       and v_order.payment_status='paid'
       and exists(select 1 from public.v112_delivery_proofs d where d.order_id=p_order_id) then
      v_earned:=now();
    else
      v_earned:=null;
    end if;

    foreach v_employee in array v_ids loop
      v_amount:=round(coalesce(v_order.total,0)*v_total_percent/100.0/v_count,2);

      insert into public.v113097_order_commission_members(
        order_id,commission_type,employee_id,is_primary,total_percent,share_percent,
        base_amount,amount,earned_at,updated_at
      ) values (
        p_order_id,v_type,v_employee,(v_employee=v_primary),v_total_percent,v_share,
        coalesce(v_order.total,0),v_amount,v_earned,now()
      );
    end loop;
  end loop;
end;
$$;

grant execute on function public.v113097_set_order_commission_team(uuid,uuid[],uuid[]) to authenticated;

create or replace function public.v113097_sync_team_commission_from_order()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.v113097_order_commission_members
  where order_id=new.id and commission_type='production';

  if v_count>0 then
    update public.v113097_order_commission_members m set
      base_amount=coalesce(new.total,0),
      amount=round(coalesce(new.total,0)*m.total_percent/100.0/v_count,2),
      earned_at=case
        when new.status='completed' and new.payment_status='paid'
        then coalesce(m.earned_at,now())
        else m.earned_at
      end,
      updated_at=now()
    where m.order_id=new.id and m.commission_type='production';
  end if;

  select count(*) into v_count
  from public.v113097_order_commission_members
  where order_id=new.id and commission_type='courier';

  if v_count>0 then
    update public.v113097_order_commission_members m set
      base_amount=coalesce(new.total,0),
      amount=round(coalesce(new.total,0)*m.total_percent/100.0/v_count,2),
      earned_at=case
        when new.payment_status='paid'
         and exists(select 1 from public.v112_delivery_proofs d where d.order_id=new.id)
        then coalesce(m.earned_at,now())
        else m.earned_at
      end,
      updated_at=now()
    where m.order_id=new.id and m.commission_type='courier';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_v113097_sync_team_commission_from_order on public.v100_orders;
create trigger trg_v113097_sync_team_commission_from_order
after update of status,payment_status,total on public.v100_orders
for each row execute function public.v113097_sync_team_commission_from_order();

create or replace function public.v113097_sync_team_courier_from_delivery()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.v113097_order_commission_members m set
    earned_at=coalesce(m.earned_at,now()),
    updated_at=now()
  where m.order_id=new.order_id
    and m.commission_type='courier'
    and exists(
      select 1 from public.v100_orders o
      where o.id=new.order_id and o.payment_status='paid'
    );
  return new;
end;
$$;

drop trigger if exists trg_v113097_sync_team_courier_from_delivery on public.v112_delivery_proofs;
create trigger trg_v113097_sync_team_courier_from_delivery
after insert on public.v112_delivery_proofs
for each row execute function public.v113097_sync_team_courier_from_delivery();

create or replace view public.v113_commission_ledger
with (security_invoker=true)
as
select
  m.order_id,o.order_no,m.employee_id,m.commission_type,m.base_amount,
  (m.total_percent*m.share_percent/100.0)::numeric(7,3) as percent,
  m.amount,m.earned_at
from public.v113097_order_commission_members m
join public.v100_orders o on o.id=m.order_id
where m.earned_at is not null

union all

select
  c.order_id,o.order_no,c.worker_id as employee_id,'production'::text as commission_type,
  c.base_amount,c.worker_percent as percent,c.worker_amount as amount,c.worker_earned_at as earned_at
from public.v113_order_commissions c
join public.v100_orders o on o.id=c.order_id
where c.worker_id is not null
  and c.worker_earned_at is not null
  and not exists(
    select 1 from public.v113097_order_commission_members m
    where m.order_id=c.order_id and m.commission_type='production'
  )

union all

select
  c.order_id,o.order_no,c.courier_id as employee_id,'courier'::text as commission_type,
  c.base_amount,c.courier_percent as percent,c.courier_amount as amount,c.courier_earned_at as earned_at
from public.v113_order_commissions c
join public.v100_orders o on o.id=c.order_id
where c.courier_id is not null
  and c.courier_earned_at is not null
  and not exists(
    select 1 from public.v113097_order_commission_members m
    where m.order_id=c.order_id and m.commission_type='courier'
  );

grant select on public.v113_commission_ledger to authenticated;

notify pgrst,'reload schema';
