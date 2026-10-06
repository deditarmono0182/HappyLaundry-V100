-- HappyLaundry Enterprise V113.0.99
-- Koreksi Nota / Biaya Tambahan Order
-- Jalankan setelah SQL 063.

create table if not exists public.v113099_order_extra_charges(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.v100_orders(id) on delete cascade,
  charge_name text not null,
  amount numeric(14,2) not null check(amount > 0),
  reason text not null,
  created_by uuid null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists v113099_extra_charge_order_idx
  on public.v113099_order_extra_charges(order_id,created_at);

alter table public.v113099_order_extra_charges enable row level security;

drop policy if exists v113099_extra_charge_select on public.v113099_order_extra_charges;
create policy v113099_extra_charge_select
on public.v113099_order_extra_charges
for select to authenticated
using(true);

grant select on public.v113099_order_extra_charges to authenticated;

create or replace function public.v113099_add_order_extra_charge(
  p_order_id uuid,
  p_charge_name text,
  p_amount numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_order public.v100_orders%rowtype;
  v_id uuid;
  v_new_total numeric(14,2);
  v_payment_status text;
begin
  if not public.v109_is_owner() then
    raise exception 'Hanya Owner yang dapat melakukan koreksi nota.';
  end if;

  if coalesce(trim(p_charge_name),'')='' then
    raise exception 'Nama biaya tambahan wajib diisi.';
  end if;

  if coalesce(p_amount,0)<=0 then
    raise exception 'Nominal biaya tambahan harus lebih dari 0.';
  end if;

  if length(coalesce(trim(p_reason),''))<5 then
    raise exception 'Alasan koreksi minimal 5 karakter.';
  end if;

  select * into v_order
  from public.v100_orders
  where id=p_order_id
  for update;

  if not found then
    raise exception 'Order tidak ditemukan.';
  end if;

  if v_order.status='cancelled' then
    raise exception 'Order dibatalkan tidak dapat dikoreksi.';
  end if;

  insert into public.v113099_order_extra_charges(
    order_id,charge_name,amount,reason,created_by
  ) values (
    p_order_id,trim(p_charge_name),round(p_amount,2),trim(p_reason),auth.uid()
  )
  returning id into v_id;

  v_new_total:=round(coalesce(v_order.total,0)+p_amount,2);

  v_payment_status:=case
    when coalesce(v_order.paid_amount,0)>=v_new_total then 'paid'
    when coalesce(v_order.paid_amount,0)>0 then 'partial'
    else 'unpaid'
  end;

  update public.v100_orders
  set
    subtotal=round(coalesce(subtotal,0)+p_amount,2),
    total=v_new_total,
    payment_status=v_payment_status,
    updated_at=now()
  where id=p_order_id;

  return v_id;
end;
$$;

grant execute on function public.v113099_add_order_extra_charge(uuid,text,numeric,text) to authenticated;

notify pgrst,'reload schema';
