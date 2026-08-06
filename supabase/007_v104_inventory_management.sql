-- HappyLaundry Enterprise V104.0 Inventory Management
-- Jalankan setelah SQL 001 sampai 006.

create extension if not exists pgcrypto;

create table if not exists public.v104_suppliers(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text null,
  contact_person text null,
  address text null,
  notes text null,
  is_active boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists v104_suppliers_name_unique
on public.v104_suppliers(lower(name));

create table if not exists public.v104_inventory_items(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'Bahan Cuci',
  unit text not null default 'pcs'
    check(unit in('ml','liter','gram','kg','pcs','roll','box','pack','item')),
  stock numeric(14,3) not null default 0,
  minimum_stock numeric(14,3) not null default 0 check(minimum_stock>=0),
  cost_price numeric(14,2) not null default 0 check(cost_price>=0),
  supplier_id uuid null references public.v104_suppliers(id) on delete set null,
  notes text null,
  is_active boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v104_inventory_stock_nonnegative check(stock>=0)
);

create unique index if not exists v104_inventory_items_name_unique
on public.v104_inventory_items(lower(name));

create index if not exists v104_inventory_items_supplier_idx
on public.v104_inventory_items(supplier_id);

create table if not exists public.v104_inventory_movements(
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.v104_inventory_items(id) on delete restrict,
  movement_type text not null check(movement_type in('in','out','adjustment')),
  quantity numeric(14,3) not null,
  unit_cost numeric(14,2) not null default 0 check(unit_cost>=0),
  total_cost numeric(14,2) generated always as (abs(quantity)*unit_cost) stored,
  supplier_id uuid null references public.v104_suppliers(id) on delete set null,
  reference text null,
  notes text null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists v104_inventory_movements_item_idx
on public.v104_inventory_movements(item_id,created_at desc);

alter table public.v104_suppliers enable row level security;
alter table public.v104_inventory_items enable row level security;
alter table public.v104_inventory_movements enable row level security;

drop policy if exists v104_suppliers_authenticated_all on public.v104_suppliers;
create policy v104_suppliers_authenticated_all
on public.v104_suppliers for all to authenticated using(true) with check(true);

drop policy if exists v104_inventory_items_authenticated_all on public.v104_inventory_items;
create policy v104_inventory_items_authenticated_all
on public.v104_inventory_items for all to authenticated using(true) with check(true);

drop policy if exists v104_inventory_movements_authenticated_all on public.v104_inventory_movements;
create policy v104_inventory_movements_authenticated_all
on public.v104_inventory_movements for all to authenticated using(true) with check(true);

create or replace function public.v104_add_inventory_movement(
  p_item_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_unit_cost numeric default 0,
  p_supplier_id uuid default null,
  p_reference text default null,
  p_notes text default null
) returns uuid
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_id uuid;
  v_current numeric;
  v_delta numeric;
begin
  if p_movement_type not in('in','out','adjustment') then
    raise exception 'Jenis transaksi stok tidak valid';
  end if;

  if p_quantity = 0 then
    raise exception 'Jumlah tidak boleh 0';
  end if;

  select stock into v_current
  from public.v104_inventory_items
  where id=p_item_id and is_active=true
  for update;

  if not found then
    raise exception 'Bahan tidak ditemukan atau nonaktif';
  end if;

  v_delta :=
    case
      when p_movement_type='in' then abs(p_quantity)
      when p_movement_type='out' then -abs(p_quantity)
      else p_quantity
    end;

  if v_current + v_delta < 0 then
    raise exception 'Stok tidak mencukupi. Stok saat ini: %', v_current;
  end if;

  update public.v104_inventory_items
  set
    stock=stock+v_delta,
    cost_price=case when p_movement_type='in' and p_unit_cost>0 then p_unit_cost else cost_price end,
    supplier_id=coalesce(p_supplier_id,supplier_id),
    updated_at=now()
  where id=p_item_id;

  insert into public.v104_inventory_movements(
    item_id,movement_type,quantity,unit_cost,supplier_id,reference,notes,created_by
  ) values(
    p_item_id,p_movement_type,abs(p_quantity),greatest(p_unit_cost,0),
    p_supplier_id,p_reference,p_notes,auth.uid()
  ) returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.v104_add_inventory_movement(uuid,text,numeric,numeric,uuid,text,text)
to authenticated;

create or replace view public.v104_inventory_items_view
with (security_invoker=true)
as
select
  i.id,i.name,i.category,i.unit,i.stock,i.minimum_stock,i.cost_price,
  i.supplier_id,s.name as supplier_name,i.is_active,i.notes,
  i.created_at,i.updated_at
from public.v104_inventory_items i
left join public.v104_suppliers s on s.id=i.supplier_id
where i.is_active=true;

create or replace view public.v104_inventory_movements_view
with (security_invoker=true)
as
select
  m.id,m.item_id,i.name as item_name,m.movement_type,m.quantity,
  m.unit_cost,m.total_cost,m.supplier_id,s.name as supplier_name,
  m.reference,m.notes,m.created_at
from public.v104_inventory_movements m
join public.v104_inventory_items i on i.id=m.item_id
left join public.v104_suppliers s on s.id=m.supplier_id;

grant select on public.v104_inventory_items_view to authenticated;
grant select on public.v104_inventory_movements_view to authenticated;

-- Seed contoh bahan. Aman: hanya masuk jika nama belum ada.
insert into public.v104_inventory_items(name,category,unit,minimum_stock,cost_price,notes)
values
  ('Deterjen Cair','Bahan Cuci','liter',5,25000,'Deterjen utama'),
  ('Pewangi','Bahan Cuci','liter',3,30000,'Pewangi laundry'),
  ('Plastik Laundry','Packaging','pcs',100,500,'Plastik packing'),
  ('Hanger','Packaging','pcs',50,1500,'Hanger pakaian')
on conflict do nothing;

notify pgrst,'reload schema';
