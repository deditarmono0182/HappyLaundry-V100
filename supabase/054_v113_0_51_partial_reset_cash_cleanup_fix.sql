-- HappyLaundry V113.0.51
-- SQL 054 - Partial Reset Cash Cleanup Fix
-- Tujuan:
-- 1. Memperbaiki v113039_safe_partial_reset agar Reset Order/Pelanggan
--    ikut menghapus transaksi kas yang berasal dari pembayaran order.
-- 2. Membersihkan orphan cash transaction akibat reset versi lama.
-- 3. Tidak menghapus kas/pengeluaran manual.

begin;

-- Bersihkan orphan pemasukan order dari reset lama.
-- Order cash dibuat oleh v100_add_payment dengan category = 'Pembayaran Order'.
-- Setelah order dihapus pada versi lama, FK ON DELETE SET NULL membuat order_id menjadi NULL.
delete from public.v100_cash_transactions
where kind = 'income'
  and category = 'Pembayaran Order'
  and order_id is null;

create or replace function public.v113039_safe_partial_reset(
  p_reset_type text,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  vo int := 0;
  vc int := 0;
  vs int := 0;
  v_cash_deleted int := 0;
begin
  select role into v_role
  from public.profiles
  where id = auth.uid();

  if auth.uid() is null or coalesce(v_role,'') <> 'owner' then
    raise exception 'Hanya Owner yang dapat melakukan reset data.';
  end if;

  if p_reset_type not in ('orders','customers','services') then
    raise exception 'RESET ALL DATA dikunci pada mode produksi.';
  end if;

  if p_reset_type = 'orders'
     and upper(trim(coalesce(p_confirmation,''))) <> 'RESET ORDER' then
    raise exception 'Konfirmasi RESET ORDER tidak sesuai.';
  end if;

  if p_reset_type = 'customers'
     and upper(trim(coalesce(p_confirmation,''))) <> 'RESET PELANGGAN' then
    raise exception 'Konfirmasi RESET PELANGGAN tidak sesuai.';
  end if;

  if p_reset_type = 'services'
     and upper(trim(coalesce(p_confirmation,''))) <> 'RESET LAYANAN' then
    raise exception 'Konfirmasi RESET LAYANAN tidak sesuai.';
  end if;

  select count(*) into vo from public.v100_orders;
  select count(*) into vc from public.v100_customers;
  select count(*) into vs from public.v100_services;

  if p_reset_type = 'orders' then
    -- Hapus hanya transaksi kas yang benar-benar terkait order.
    -- Dilakukan SEBELUM order dihapus agar order_id belum berubah menjadi NULL.
    delete from public.v100_cash_transactions ct
    where ct.order_id in (select id from public.v100_orders)
      and ct.kind = 'income'
      and ct.category = 'Pembayaran Order';
    get diagnostics v_cash_deleted = row_count;

    if to_regclass('public.v1129_payment_proofs') is not null then
      execute 'delete from public.v1129_payment_proofs where id is not null';
    end if;

    delete from public.v100_payments where id is not null;
    delete from public.v100_order_items where id is not null;
    delete from public.v100_orders where id is not null;

  elsif p_reset_type = 'customers' then
    -- Reset pelanggan ikut menghapus seluruh order terkait,
    -- maka cash dari pembayaran order juga harus dibersihkan.
    delete from public.v100_cash_transactions ct
    where ct.order_id in (select id from public.v100_orders)
      and ct.kind = 'income'
      and ct.category = 'Pembayaran Order';
    get diagnostics v_cash_deleted = row_count;

    if to_regclass('public.v1129_payment_proofs') is not null then
      execute 'delete from public.v1129_payment_proofs where id is not null';
    end if;

    delete from public.v100_payments where id is not null;
    delete from public.v100_order_items where id is not null;
    delete from public.v100_orders where id is not null;
    delete from public.v100_customers where id is not null;

  else
    -- Reset layanan tidak menyentuh kas.
    delete from public.v100_services where id is not null;
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', case p_reset_type
      when 'orders' then 'Reset Data Order berhasil.'
      when 'customers' then 'Reset Data Pelanggan berhasil.'
      else 'Reset Data Layanan berhasil.'
    end,
    'orders_deleted', case when p_reset_type in ('orders','customers') then vo else 0 end,
    'customers_deleted', case when p_reset_type = 'customers' then vc else 0 end,
    'services_deleted', case when p_reset_type = 'services' then vs else 0 end,
    'order_cash_deleted', v_cash_deleted,
    'rpc_version', '113.0.51-sql054'
  );
end;
$$;

revoke all on function public.v113039_safe_partial_reset(text,text) from public;
grant execute on function public.v113039_safe_partial_reset(text,text) to authenticated;

notify pgrst, 'reload schema';

commit;
