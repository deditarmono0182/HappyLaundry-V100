-- HappyLaundry Enterprise V113.0.41
-- Komisi per Order: Karyawan Produksi + Kurir (persentase snapshot per order)
-- Jalankan SETELAH SQL 047 dan 048.

create table if not exists public.v113_employee_commission_settings(
  employee_id uuid primary key references public.v109_users(id) on delete cascade,
  production_percent numeric(7,3) not null default 0 check(production_percent>=0 and production_percent<=100),
  courier_percent numeric(7,3) not null default 0 check(courier_percent>=0 and courier_percent<=100),
  updated_at timestamptz not null default now()
);

create table if not exists public.v113_order_commissions(
  order_id uuid primary key references public.v100_orders(id) on delete cascade,
  worker_id uuid null references public.v109_users(id) on delete set null,
  worker_percent numeric(7,3) not null default 0 check(worker_percent>=0 and worker_percent<=100),
  worker_amount numeric(14,2) not null default 0,
  worker_earned_at timestamptz null,
  courier_id uuid null references public.v109_users(id) on delete set null,
  courier_percent numeric(7,3) not null default 0 check(courier_percent>=0 and courier_percent<=100),
  courier_amount numeric(14,2) not null default 0,
  courier_earned_at timestamptz null,
  base_amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


create or replace function public.v113_list_commission_employees()
returns table(id uuid,full_name text,login_id text)
language sql
stable
security definer
set search_path=public
as $$
  select u.id,u.full_name,u.login_id
  from public.v109_users u
  where u.is_active=true
  order by u.full_name;
$$;
grant execute on function public.v113_list_commission_employees() to authenticated;

create index if not exists v113_order_commissions_worker_idx on public.v113_order_commissions(worker_id);
create index if not exists v113_order_commissions_courier_idx on public.v113_order_commissions(courier_id);
create index if not exists v113_order_commissions_worker_earned_idx on public.v113_order_commissions(worker_earned_at);
create index if not exists v113_order_commissions_courier_earned_idx on public.v113_order_commissions(courier_earned_at);

alter table public.v113_employee_commission_settings enable row level security;
alter table public.v113_order_commissions enable row level security;

drop policy if exists v113_employee_commission_settings_select on public.v113_employee_commission_settings;
create policy v113_employee_commission_settings_select
on public.v113_employee_commission_settings for select to authenticated using(true);

drop policy if exists v113_employee_commission_settings_owner_write on public.v113_employee_commission_settings;
create policy v113_employee_commission_settings_owner_write
on public.v113_employee_commission_settings for all to authenticated
using(public.v109_is_owner()) with check(public.v109_is_owner());

drop policy if exists v113_order_commissions_select on public.v113_order_commissions;
create policy v113_order_commissions_select
on public.v113_order_commissions for select to authenticated using(true);

drop policy if exists v113_order_commissions_insert on public.v113_order_commissions;
create policy v113_order_commissions_insert
on public.v113_order_commissions for insert to authenticated
with check(auth.uid() is not null);

drop policy if exists v113_order_commissions_owner_update on public.v113_order_commissions;
create policy v113_order_commissions_owner_update
on public.v113_order_commissions for update to authenticated
using(public.v109_is_owner()) with check(public.v109_is_owner());

drop policy if exists v113_order_commissions_owner_delete on public.v113_order_commissions;
create policy v113_order_commissions_owner_delete
on public.v113_order_commissions for delete to authenticated
using(public.v109_is_owner());

grant select,insert,update,delete on public.v113_employee_commission_settings to authenticated;
grant select,insert,update,delete on public.v113_order_commissions to authenticated;

-- Server selalu mengambil total order sebagai dasar snapshot, bukan nilai dari browser.
create or replace function public.v113_prepare_order_commission()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_total numeric(14,2);
  v_status text;
  v_payment_status text;
begin
  select total,status,payment_status into v_total,v_status,v_payment_status
  from public.v100_orders where id=new.order_id;
  if not found then raise exception 'Order tidak ditemukan.'; end if;

  -- Persentase selalu diambil dari pengaturan server agar tidak bisa dimanipulasi dari browser.
  if new.worker_id is not null then
    select coalesce(production_percent,0) into new.worker_percent
    from public.v113_employee_commission_settings where employee_id=new.worker_id;
    new.worker_percent:=coalesce(new.worker_percent,0);
  else
    new.worker_percent:=0;
  end if;

  if new.courier_id is not null then
    select coalesce(courier_percent,0) into new.courier_percent
    from public.v113_employee_commission_settings where employee_id=new.courier_id;
    new.courier_percent:=coalesce(new.courier_percent,0);
  else
    new.courier_percent:=0;
  end if;

  new.base_amount:=coalesce(v_total,0);
  new.worker_amount:=round(new.base_amount*new.worker_percent/100,2);
  new.courier_amount:=round(new.base_amount*new.courier_percent/100,2);
  new.updated_at:=now();

  if new.worker_id is not null and new.worker_percent>0
     and v_status='completed' and v_payment_status='paid' then
    new.worker_earned_at:=coalesce(new.worker_earned_at,now());
  end if;

  if new.courier_id is not null and new.courier_percent>0
     and v_payment_status='paid'
     and exists(select 1 from public.v112_delivery_proofs d where d.order_id=new.order_id) then
    new.courier_earned_at:=coalesce(new.courier_earned_at,now());
  end if;

  return new;
end;
$$;

drop trigger if exists trg_v113_prepare_order_commission on public.v113_order_commissions;
create trigger trg_v113_prepare_order_commission
before insert on public.v113_order_commissions
for each row execute function public.v113_prepare_order_commission();

-- Saat order sudah selesai DAN lunas, komisi produksi menjadi hak karyawan.
-- Komisi kurir menjadi hak kurir saat order lunas DAN bukti pengiriman sudah dikonfirmasi.
create or replace function public.v113_sync_commission_from_order()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.v113_order_commissions c set
    worker_earned_at=case
      when c.worker_id is not null and c.worker_percent>0
       and new.status='completed' and new.payment_status='paid'
      then coalesce(c.worker_earned_at,now()) else c.worker_earned_at end,
    courier_earned_at=case
      when c.courier_id is not null and c.courier_percent>0
       and new.payment_status='paid'
       and exists(select 1 from public.v112_delivery_proofs d where d.order_id=new.id)
      then coalesce(c.courier_earned_at,now()) else c.courier_earned_at end,
    updated_at=now()
  where c.order_id=new.id;
  return new;
end;
$$;

drop trigger if exists trg_v113_sync_commission_from_order on public.v100_orders;
create trigger trg_v113_sync_commission_from_order
after update of status,payment_status,total on public.v100_orders
for each row execute function public.v113_sync_commission_from_order();

create or replace function public.v113_sync_courier_commission_from_delivery()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.v113_order_commissions c set
    courier_earned_at=coalesce(c.courier_earned_at,now()),
    updated_at=now()
  where c.order_id=new.order_id
    and c.courier_id is not null
    and c.courier_percent>0
    and exists(select 1 from public.v100_orders o where o.id=new.order_id and o.payment_status='paid');
  return new;
end;
$$;

drop trigger if exists trg_v113_sync_courier_commission_from_delivery on public.v112_delivery_proofs;
create trigger trg_v113_sync_courier_commission_from_delivery
after insert on public.v112_delivery_proofs
for each row execute function public.v113_sync_courier_commission_from_delivery();

create or replace view public.v113_commission_ledger
with (security_invoker=true)
as
select
  c.order_id,o.order_no,c.worker_id as employee_id,'production'::text as commission_type,
  c.base_amount,c.worker_percent as percent,c.worker_amount as amount,c.worker_earned_at as earned_at
from public.v113_order_commissions c
join public.v100_orders o on o.id=c.order_id
where c.worker_id is not null and c.worker_earned_at is not null
union all
select
  c.order_id,o.order_no,c.courier_id as employee_id,'courier'::text as commission_type,
  c.base_amount,c.courier_percent as percent,c.courier_amount as amount,c.courier_earned_at as earned_at
from public.v113_order_commissions c
join public.v100_orders o on o.id=c.order_id
where c.courier_id is not null and c.courier_earned_at is not null;

grant select on public.v113_commission_ledger to authenticated;

notify pgrst,'reload schema';
