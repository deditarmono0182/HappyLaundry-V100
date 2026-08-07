-- HappyLaundry Enterprise V110.7
-- Owner-only Reset Data
-- Jalankan SETELAH SQL V110.6.

create or replace function public.v110_reset_data(
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
  v_orders bigint:=0;
  v_customers bigint:=0;
  v_services bigint:=0;
begin
  -- OWNER ONLY. Employees with Backup permission cannot reset.
  if auth.uid() is null or not exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='owner'
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

  if v_type in ('orders','customers','all') then
    select count(*) into v_orders from public.v100_orders;

    -- Cash rows linked to orders would become orphaned by ON DELETE SET NULL,
    -- so delete them first to make an Order reset financially clean.
    delete from public.v100_cash_transactions
    where order_id is not null;

    -- v100_order_items and v100_payments cascade automatically.
    delete from public.v100_orders;
  end if;

  if v_type in ('customers','all') then
    select count(*) into v_customers from public.v100_customers;
    delete from public.v100_customers;
  end if;

  if v_type in ('services','all') then
    select count(*) into v_services from public.v100_services;
    delete from public.v100_services;
  end if;

  if v_type='all' then
    -- Finance operational data.
    if to_regclass('public.v106_expenses') is not null then
      execute 'delete from public.v106_expenses';
    end if;

    -- Inventory movement must be removed before inventory items.
    if to_regclass('public.v104_inventory_movements') is not null then
      execute 'delete from public.v104_inventory_movements';
    end if;
    if to_regclass('public.v104_inventory_items') is not null then
      execute 'delete from public.v104_inventory_items';
    end if;
    if to_regclass('public.v104_suppliers') is not null then
      execute 'delete from public.v104_suppliers';
    end if;

    -- Intentionally PRESERVED:
    -- profiles / auth users
    -- v109_users (employee accounts)
    -- v100_store_settings (store identity / WhatsApp)
    -- v106_expense_categories (category setup)
    -- v110_revenue_share_settings (percentage configuration)
    -- login/audit history
  end if;

  return jsonb_build_object(
    'ok',true,
    'reset_type',v_type,
    'orders_deleted',v_orders,
    'customers_deleted',v_customers,
    'services_deleted',v_services,
    'message',
      case v_type
        when 'orders' then 'Reset Data Order berhasil. Order dan transaksi terkait telah dibersihkan.'
        when 'customers' then 'Reset Data Pelanggan berhasil. Pelanggan serta order terkait telah dibersihkan.'
        when 'services' then 'Reset Data Layanan berhasil. Daftar layanan telah dibersihkan.'
        when 'all' then 'Reset ALL DATA berhasil. Data operasional telah dibersihkan; akun login dan pengaturan utama tetap disimpan.'
      end
  );
end;
$$;

revoke all on function public.v110_reset_data(text,text) from public;
grant execute on function public.v110_reset_data(text,text) to authenticated;

notify pgrst,'reload schema';
