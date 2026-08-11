-- V113.0.34 Safe Reset All Data
create or replace function public.v113034_reset_operational_data()
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare v_role text;
begin
  select role into v_role from public.profiles where id=auth.uid();
  if auth.uid() is null or coalesce(v_role,'') <> 'owner' then
    raise exception 'Hanya Owner yang dapat RESET ALL DATA.';
  end if;

  if to_regclass('public.v1129_payment_proofs') is not null then execute 'delete from public.v1129_payment_proofs where id is not null'; end if;
  if to_regclass('public.v100_payments') is not null then execute 'delete from public.v100_payments where id is not null'; end if;
  if to_regclass('public.v100_order_items') is not null then execute 'delete from public.v100_order_items where id is not null'; end if;
  if to_regclass('public.v100_orders') is not null then execute 'delete from public.v100_orders where id is not null'; end if;
  if to_regclass('public.v100_cash_entries') is not null then execute 'delete from public.v100_cash_entries where id is not null'; end if;
  if to_regclass('public.v100_customers') is not null then execute 'delete from public.v100_customers where id is not null'; end if;
  if to_regclass('public.v100_services') is not null then execute 'delete from public.v100_services where id is not null'; end if;
  return true;
end;
$$;
revoke all on function public.v113034_reset_operational_data() from public;
grant execute on function public.v113034_reset_operational_data() to authenticated;
notify pgrst,'reload schema';
