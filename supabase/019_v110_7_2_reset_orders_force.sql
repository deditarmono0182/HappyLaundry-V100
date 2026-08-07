-- HappyLaundry Enterprise V110.7.2
-- Dedicated Force Reset Order
-- Jalankan SETELAH 018_v110_7_1_reset_order_fix.sql

create or replace function public.v110_reset_orders_force(
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_before bigint:=0;
  v_after bigint:=0;
  v_payments bigint:=0;
  v_items bigint:=0;
  v_cash bigint:=0;
begin
  if auth.uid() is null or not exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='owner'
  ) then
    raise exception 'Hanya Owner yang dapat melakukan Reset Data Order.';
  end if;

  if upper(btrim(coalesce(p_confirmation,'')))<>'RESET ORDER' then
    raise exception 'Konfirmasi harus RESET ORDER.';
  end if;

  select count(*) into v_before from public.v100_orders;

  select count(*) into v_payments from public.v100_payments;
  delete from public.v100_payments;

  select count(*) into v_items from public.v100_order_items;
  delete from public.v100_order_items;

  if to_regclass('public.v100_cash_transactions') is not null then
    execute 'select count(*) from public.v100_cash_transactions where order_id is not null' into v_cash;
    execute 'delete from public.v100_cash_transactions where order_id is not null';
  end if;

  delete from public.v100_orders;

  select count(*) into v_after from public.v100_orders;

  if v_after<>0 then
    raise exception 'Reset gagal diverifikasi. Masih ada % order.',v_after;
  end if;

  return jsonb_build_object(
    'ok',true,
    'message','Reset Data Order berhasil.',
    'orders_deleted',v_before,
    'payments_deleted',v_payments,
    'items_deleted',v_items,
    'cash_deleted',v_cash,
    'remaining_orders',v_after,
    'rpc_version','110.7.2'
  );
end;
$$;

revoke all on function public.v110_reset_orders_force(text) from public;
grant execute on function public.v110_reset_orders_force(text) to authenticated;

notify pgrst,'reload schema';
