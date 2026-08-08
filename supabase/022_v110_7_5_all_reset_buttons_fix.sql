-- HappyLaundry Enterprise V110.7.5
-- Fix ALL Reset Buttons
-- Jalankan SETELAH SQL 021.

create or replace function public.v110_reset_data_v5(
  p_reset_type text,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_type text:=lower(btrim(coalesce(p_reset_type,'')));
  v_expected text;
  v_orders_before bigint:=0;
  v_customers_before bigint:=0;
  v_services_before bigint:=0;
  v_orders_after bigint:=0;
  v_view_after bigint:=0;
begin
  if auth.uid() is null or not exists(
    select 1
    from public.profiles p
    where p.id=auth.uid()
      and p.role='owner'
  ) then
    raise exception 'Hanya Owner yang dapat melakukan Reset Data.';
  end if;

  v_expected:=case v_type
    when 'orders' then 'RESET ORDER'
    when 'customers' then 'RESET PELANGGAN'
    when 'services' then 'RESET LAYANAN'
    when 'all' then 'RESET ALL DATA'
    else null
  end;

  if v_expected is null then
    raise exception 'Pilihan reset tidak valid.';
  end if;

  if upper(btrim(coalesce(p_confirmation,'')))<>v_expected then
    raise exception 'Konfirmasi reset tidak cocok.';
  end if;

  select count(*) into v_orders_before from public.v100_orders;
  select count(*) into v_customers_before from public.v100_customers;
  select count(*) into v_services_before from public.v100_services;

  -- ORDER / PELANGGAN / ALL:
  -- clear cash relation then hard-reset order tree.
  if v_type in ('orders','customers','all') then
    if to_regclass('public.v100_cash_transactions') is not null then
      execute 'delete from public.v100_cash_transactions where order_id is not null';
    end if;

    execute 'truncate table public.v100_orders cascade';
  end if;

  -- PELANGGAN / ALL:
  if v_type in ('customers','all') then
    execute 'truncate table public.v100_customers cascade';
  end if;

  -- LAYANAN / ALL:
  -- DELETE is intentional: order_items.service_id uses ON DELETE SET NULL,
  -- so service reset does not need to erase historic orders.
  if v_type in ('services','all') then
    delete from public.v100_services;
  end if;

  -- ALL DATA: operational finance/inventory/cash.
  if v_type='all' then
    if to_regclass('public.v106_expenses') is not null then
      execute 'delete from public.v106_expenses';
    end if;

    if to_regclass('public.v104_inventory_movements') is not null then
      execute 'delete from public.v104_inventory_movements';
    end if;

    if to_regclass('public.v104_inventory_items') is not null then
      execute 'delete from public.v104_inventory_items';
    end if;

    if to_regclass('public.v104_suppliers') is not null then
      execute 'delete from public.v104_suppliers';
    end if;

    if to_regclass('public.v100_cash_transactions') is not null then
      execute 'delete from public.v100_cash_transactions';
    end if;
  end if;

  select count(*) into v_orders_after from public.v100_orders;
  select count(*) into v_view_after from public.v100_orders_view;

  if v_type in ('orders','customers','all')
     and (v_orders_after<>0 or v_view_after<>0) then
    raise exception
      'Reset Order tidak tuntas. Tabel=% View=%',
      v_orders_after,v_view_after;
  end if;

  return jsonb_build_object(
    'ok',true,
    'message',
      case v_type
        when 'orders' then 'RESET DATA ORDER BERHASIL.'
        when 'customers' then 'RESET DATA PELANGGAN BERHASIL.'
        when 'services' then 'RESET DATA LAYANAN BERHASIL.'
        when 'all' then 'RESET ALL DATA BERHASIL.'
      end,
    'orders_deleted',
      case when v_type in ('orders','customers','all') then v_orders_before else 0 end,
    'customers_deleted',
      case when v_type in ('customers','all') then v_customers_before else 0 end,
    'services_deleted',
      case when v_type in ('services','all') then v_services_before else 0 end,
    'table_count',v_orders_after,
    'view_count',v_view_after,
    'rpc_version','110.7.5'
  );
end;
$$;

revoke all on function public.v110_reset_data_v5(text,text) from public;
grant execute on function public.v110_reset_data_v5(text,text) to authenticated;

notify pgrst,'reload schema';
