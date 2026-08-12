-- HappyLaundry Enterprise V113.0.42
-- FIX Komisi Kurir: masuk otomatis saat order Selesai + Lunas.
-- Jalankan SEKALI setelah SQL 049.

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
     and v_status='completed' and v_payment_status='paid' then
    new.courier_earned_at:=coalesce(new.courier_earned_at,now());
  end if;

  return new;
end;
$$;

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
       and new.status='completed' and new.payment_status='paid'
      then coalesce(c.courier_earned_at,now()) else c.courier_earned_at end,
    base_amount=coalesce(new.total,0),
    worker_amount=round(coalesce(new.total,0)*c.worker_percent/100,2),
    courier_amount=round(coalesce(new.total,0)*c.courier_percent/100,2),
    updated_at=now()
  where c.order_id=new.id;
  return new;
end;
$$;

-- Backfill order lama yang sudah Selesai + Lunas tetapi komisi kurir belum masuk.
update public.v113_order_commissions c
set courier_earned_at=coalesce(c.courier_earned_at,now()),
    base_amount=coalesce(o.total,0),
    courier_amount=round(coalesce(o.total,0)*c.courier_percent/100,2),
    updated_at=now()
from public.v100_orders o
where o.id=c.order_id
  and c.courier_id is not null
  and c.courier_percent>0
  and o.status='completed'
  and o.payment_status='paid'
  and c.courier_earned_at is null;

notify pgrst,'reload schema';
