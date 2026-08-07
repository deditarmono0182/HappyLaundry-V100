-- HappyLaundry Enterprise V110.7.3
-- Hard Reset Order + Diagnostic
-- Jalankan SETELAH SQL 019.

create or replace function public.v110_order_reset_diagnostic()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_table bigint:=0;
  v_view bigint:=0;
  v_owner boolean:=false;
begin
  select exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='owner'
  ) into v_owner;

  if auth.uid() is null or not v_owner then
    raise exception 'Hanya Owner yang dapat menjalankan diagnostic.';
  end if;

  select count(*) into v_table from public.v100_orders;
  select count(*) into v_view from public.v100_orders_view;

  return jsonb_build_object(
    'ok',true,
    'table_count',v_table,
    'view_count',v_view,
    'rpc_version','110.7.3'
  );
end;
$$;

revoke all on function public.v110_order_reset_diagnostic() from public;
grant execute on function public.v110_order_reset_diagnostic() to authenticated;


create or replace function public.v110_reset_orders_hard_v3(
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
  v_view_after bigint:=0;
  v_payments bigint:=0;
  v_items bigint:=0;
  v_cash bigint:=0;
begin
  if auth.uid() is null or not exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='owner'
  ) then
    raise exception 'Hanya Owner yang dapat Reset Data Order.';
  end if;

  if upper(btrim(coalesce(p_confirmation,'')))<>'RESET ORDER' then
    raise exception 'Konfirmasi harus RESET ORDER.';
  end if;

  select count(*) into v_before from public.v100_orders;

  -- Lock tables to prevent a concurrent insert while reset is running.
  lock table public.v100_orders in access exclusive mode;
  lock table public.v100_order_items in access exclusive mode;
  lock table public.v100_payments in access exclusive mode;

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
  select count(*) into v_view_after from public.v100_orders_view;

  if v_after<>0 or v_view_after<>0 then
    raise exception
      'Reset tidak tuntas. v100_orders=% dan v100_orders_view=%',
      v_after,v_view_after;
  end if;

  return jsonb_build_object(
    'ok',true,
    'message','Reset Data Order berhasil.',
    'orders_deleted',v_before,
    'payments_deleted',v_payments,
    'items_deleted',v_items,
    'cash_deleted',v_cash,
    'remaining_orders',v_after,
    'table_count',v_after,
    'view_count',v_view_after,
    'rpc_version','110.7.3'
  );
end;
$$;

revoke all on function public.v110_reset_orders_hard_v3(text) from public;
grant execute on function public.v110_reset_orders_hard_v3(text) to authenticated;

notify pgrst,'reload schema';
