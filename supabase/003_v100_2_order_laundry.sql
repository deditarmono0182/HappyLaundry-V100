-- HappyLaundry V100.2 Order Laundry
-- Jalankan setelah 001 dan 002.

create sequence if not exists public.v100_order_number_seq start 1;

create table if not exists public.v100_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  store_id uuid null,
  customer_id uuid not null references public.v100_customers(id) on delete restrict,
  status text not null default 'received'
    check (status in ('received','washing','drying','ironing','packing','ready','completed','cancelled')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid','partial','paid')),
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0,
  notes text null,
  due_at timestamptz null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v100_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.v100_orders(id) on delete cascade,
  service_id uuid null references public.v100_services(id) on delete set null,
  service_name text not null,
  unit text not null,
  price numeric(14,2) not null default 0,
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  subtotal numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.v100_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.v100_orders(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  method text not null default 'cash' check (method in ('cash','qris','transfer','other')),
  notes text null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists v100_orders_customer_idx on public.v100_orders(customer_id);
create index if not exists v100_orders_status_idx on public.v100_orders(status);
create index if not exists v100_orders_created_idx on public.v100_orders(created_at desc);
create index if not exists v100_order_items_order_idx on public.v100_order_items(order_id);
create index if not exists v100_payments_order_idx on public.v100_payments(order_id);

alter table public.v100_orders enable row level security;
alter table public.v100_order_items enable row level security;
alter table public.v100_payments enable row level security;

drop policy if exists v100_orders_authenticated_all on public.v100_orders;
create policy v100_orders_authenticated_all on public.v100_orders
for all to authenticated using (true) with check (true);

drop policy if exists v100_order_items_authenticated_all on public.v100_order_items;
create policy v100_order_items_authenticated_all on public.v100_order_items
for all to authenticated using (true) with check (true);

drop policy if exists v100_payments_authenticated_all on public.v100_payments;
create policy v100_payments_authenticated_all on public.v100_payments
for all to authenticated using (true) with check (true);

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
  o.created_at
from public.v100_orders o
join public.v100_customers c on c.id = o.customer_id;

grant select on public.v100_orders_view to authenticated;

create or replace function public.v100_create_order(
  p_customer_id uuid,
  p_discount numeric,
  p_paid_amount numeric,
  p_notes text,
  p_due_at timestamptz,
  p_items jsonb
)
returns table(order_id uuid, order_no text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order_id uuid;
  v_order_no text;
  v_subtotal numeric(14,2);
  v_total numeric(14,2);
  v_payment_status text;
  v_item jsonb;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Minimal satu layanan harus dipilih';
  end if;

  select coalesce(sum(
    (item->>'price')::numeric * (item->>'quantity')::numeric
  ),0)
  into v_subtotal
  from jsonb_array_elements(p_items) item;

  v_total := greatest(0, v_subtotal - coalesce(p_discount,0));

  if coalesce(p_paid_amount,0) < 0 or coalesce(p_paid_amount,0) > v_total then
    raise exception 'Pembayaran awal tidak valid';
  end if;

  v_payment_status :=
    case
      when coalesce(p_paid_amount,0) <= 0 then 'unpaid'
      when coalesce(p_paid_amount,0) >= v_total then 'paid'
      else 'partial'
    end;

  v_order_no := 'HL-' || to_char(current_date,'YYMMDD') || '-' ||
    lpad(nextval('public.v100_order_number_seq')::text,5,'0');

  insert into public.v100_orders(
    order_no, customer_id, status, payment_status,
    subtotal, discount, total, paid_amount, notes, due_at, created_by
  )
  values(
    v_order_no, p_customer_id, 'received', v_payment_status,
    v_subtotal, coalesce(p_discount,0), v_total, coalesce(p_paid_amount,0),
    p_notes, p_due_at, auth.uid()
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.v100_order_items(
      order_id, service_id, service_name, unit, price, quantity, subtotal
    )
    values(
      v_order_id,
      nullif(v_item->>'service_id','')::uuid,
      v_item->>'service_name',
      v_item->>'unit',
      (v_item->>'price')::numeric,
      (v_item->>'quantity')::numeric,
      (v_item->>'price')::numeric * (v_item->>'quantity')::numeric
    );
  end loop;

  if coalesce(p_paid_amount,0) > 0 then
    insert into public.v100_payments(order_id,amount,method,created_by)
    values(v_order_id,p_paid_amount,'cash',auth.uid());
  end if;

  return query select v_order_id, v_order_no;
end;
$$;

grant execute on function public.v100_create_order(uuid,numeric,numeric,text,timestamptz,jsonb) to authenticated;
grant usage, select on sequence public.v100_order_number_seq to authenticated;

notify pgrst, 'reload schema';
