-- HappyLaundry Enterprise V113.0.61
-- SQL 056 — Snapshot Kasir / Dibuat Oleh pada setiap order
-- Jalankan SEKALI di Supabase SQL Editor SEBELUM deploy V113.0.61.

begin;

alter table public.v100_orders
  add column if not exists created_by_name text,
  add column if not exists created_by_login_id text;

-- Backfill Owner yang masih dapat dicocokkan dari profiles.
update public.v100_orders o
set created_by_name = p.full_name
from public.profiles p
where o.created_by_name is null
  and o.created_by = p.id;

-- Backfill karyawan yang auth_uid historisnya masih sama dengan mapping saat ini.
update public.v100_orders o
set
  created_by_name = u.full_name,
  created_by_login_id = u.login_id
from public.v109_users u
where o.created_by_name is null
  and o.created_by = u.auth_uid;

-- Snapshot otomatis pada INSERT agar nama kasir historis tidak berubah
-- walaupun auth/session karyawan berubah di kemudian hari.
create or replace function public.v113061_snapshot_order_creator()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_name text;
  v_login text;
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;

  if coalesce(btrim(new.created_by_name),'') = '' then
    select p.full_name
      into v_name
    from public.profiles p
    where p.id = auth.uid()
    limit 1;

    if v_name is null then
      select e.full_name, e.login_id
        into v_name, v_login
      from public.v109_current_employee() e
      limit 1;
    end if;

    new.created_by_name := coalesce(v_name,'Kasir');
    new.created_by_login_id := v_login;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_v113061_snapshot_order_creator on public.v100_orders;
create trigger trg_v113061_snapshot_order_creator
before insert on public.v100_orders
for each row execute function public.v113061_snapshot_order_creator();

-- Tambahkan snapshot kasir ke view order yang dipakai aplikasi.
create or replace view public.v100_orders_view
with (security_invoker = true)
as
select
  o.id,
  o.order_no,
  o.customer_id,
  c.name as customer_name,
  c.phone as customer_phone,
  o.status,
  o.payment_status,
  o.subtotal,
  o.discount,
  o.total,
  o.paid_amount,
  o.notes,
  o.due_at,
  o.created_at,
  o.created_by_name,
  o.created_by_login_id
from public.v100_orders o
join public.v100_customers c on c.id = o.customer_id;

grant select on public.v100_orders_view to authenticated;

notify pgrst, 'reload schema';

commit;
