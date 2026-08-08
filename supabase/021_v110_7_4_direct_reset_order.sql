-- HappyLaundry Enterprise V110.7.4
-- Direct Reset Order using TRUNCATE CASCADE
-- Jalankan SETELAH SQL 020.

create or replace function public.v110_reset_orders_v4(
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
  v_view bigint:=0;
begin
  if auth.uid() is null or not exists(
    select 1
    from public.profiles p
    where p.id=auth.uid()
      and p.role='owner'
  ) then
    raise exception 'Hanya Owner yang dapat Reset Order.';
  end if;

  if upper(btrim(coalesce(p_confirmation,''))) <> 'RESET ORDER' then
    raise exception 'Konfirmasi harus RESET ORDER.';
  end if;

  select count(*) into v_before from public.v100_orders;

  -- Bersihkan kas yang berelasi order lebih dulu agar tidak menyisakan histori order.
  if to_regclass('public.v100_cash_transactions') is not null then
    execute 'delete from public.v100_cash_transactions where order_id is not null';
  end if;

  -- TRUNCATE CASCADE adalah reset keras untuk tabel order dan dependency FK.
  execute 'truncate table public.v100_orders cascade';

  select count(*) into v_after from public.v100_orders;
  select count(*) into v_view from public.v100_orders_view;

  if v_after <> 0 or v_view <> 0 then
    raise exception 'Reset gagal. Tabel tersisa %, view tersisa %.', v_after, v_view;
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', 'RESET ORDER BERHASIL.',
    'before_count', v_before,
    'after_count', v_after,
    'view_count', v_view,
    'rpc_version', '110.7.4'
  );
end;
$$;

revoke all on function public.v110_reset_orders_v4(text) from public;
grant execute on function public.v110_reset_orders_v4(text) to authenticated;

notify pgrst,'reload schema';
