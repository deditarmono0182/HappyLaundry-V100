-- HappyLaundry V100.3 Kasir & Pembayaran
create table if not exists public.v100_cash_transactions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid null,
  kind text not null check (kind in ('income','expense')),
  category text not null default 'Operasional',
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  method text not null default 'cash' check (method in ('cash','qris','transfer','other')),
  order_id uuid null references public.v100_orders(id) on delete set null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.v100_cash_transactions enable row level security;
drop policy if exists v100_cash_authenticated_all on public.v100_cash_transactions;
create policy v100_cash_authenticated_all on public.v100_cash_transactions for all to authenticated using (true) with check (true);
create index if not exists v100_cash_created_idx on public.v100_cash_transactions(created_at desc);

create or replace function public.v100_add_payment(p_order_id uuid,p_amount numeric,p_method text,p_notes text)
returns void language plpgsql security invoker set search_path=public as $$
declare v_total numeric; v_paid numeric; v_new_paid numeric; v_status text;
begin
  if p_amount <= 0 then raise exception 'Nominal harus lebih dari nol'; end if;
  if p_method not in ('cash','qris','transfer','other') then raise exception 'Metode tidak valid'; end if;
  select total,paid_amount into v_total,v_paid from public.v100_orders where id=p_order_id for update;
  if not found then raise exception 'Order tidak ditemukan'; end if;
  v_new_paid:=v_paid+p_amount;
  if v_new_paid>v_total then raise exception 'Pembayaran melebihi sisa tagihan'; end if;
  v_status:=case when v_new_paid>=v_total then 'paid' when v_new_paid>0 then 'partial' else 'unpaid' end;
  insert into public.v100_payments(order_id,amount,method,notes,created_by) values(p_order_id,p_amount,p_method,p_notes,auth.uid());
  update public.v100_orders set paid_amount=v_new_paid,payment_status=v_status,updated_at=now() where id=p_order_id;
  insert into public.v100_cash_transactions(kind,category,description,amount,method,order_id,created_by)
  select 'income','Pembayaran Order','Pembayaran '||order_no,p_amount,p_method,id,auth.uid() from public.v100_orders where id=p_order_id;
end;$$;
grant execute on function public.v100_add_payment(uuid,numeric,text,text) to authenticated;
notify pgrst,'reload schema';
