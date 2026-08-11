-- HappyLaundry V113.0.37 — Backup & Restore Owner
-- Jalankan setelah SQL 045.
-- Aman dijalankan pada instalasi yang sebelumnya sudah mempunyai tabel v113035_safety_snapshots.

alter table public.v113035_safety_snapshots
  add column if not exists customers jsonb not null default '[]'::jsonb,
  add column if not exists services jsonb not null default '[]'::jsonb,
  add column if not exists order_items jsonb not null default '[]'::jsonb,
  add column if not exists cash_transactions jsonb not null default '[]'::jsonb;

create or replace function public.v113037_is_owner()
returns boolean
language sql
security definer
stable
set search_path=public
as $$
  select exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='owner'
  )
$$;

create or replace function public.v113037_create_safety_snapshot(p_label text default 'manual')
returns bigint
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id bigint;
  v_customers jsonb:='[]'::jsonb;
  v_services jsonb:='[]'::jsonb;
  v_orders jsonb:='[]'::jsonb;
  v_items jsonb:='[]'::jsonb;
  v_payments jsonb:='[]'::jsonb;
  v_cash jsonb:='[]'::jsonb;
begin
  if not public.v113037_is_owner() then
    raise exception 'Hanya Owner yang dapat membuat Safety Snapshot.';
  end if;

  if to_regclass('public.v100_customers') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from public.v100_customers x' into v_customers;
  end if;
  if to_regclass('public.v100_services') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from public.v100_services x' into v_services;
  end if;
  if to_regclass('public.v100_orders') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from public.v100_orders x' into v_orders;
  end if;
  if to_regclass('public.v100_order_items') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from public.v100_order_items x' into v_items;
  end if;
  if to_regclass('public.v100_payments') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from public.v100_payments x' into v_payments;
  end if;
  if to_regclass('public.v100_cash_transactions') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from public.v100_cash_transactions x' into v_cash;
  elsif to_regclass('public.v100_cash_entries') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from public.v100_cash_entries x' into v_cash;
  end if;

  insert into public.v113035_safety_snapshots(
    label,customers,services,orders,order_items,payments,cash_transactions,cash_entries
  ) values(
    coalesce(nullif(trim(p_label),''),'manual'),
    v_customers,v_services,v_orders,v_items,v_payments,v_cash,v_cash
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.v113037_create_safety_snapshot(text) from public;
grant execute on function public.v113037_create_safety_snapshot(text) to authenticated;

create or replace function public.v113037_list_safety_snapshots()
returns table(
  id bigint,
  label text,
  created_at timestamptz,
  created_by uuid,
  customer_count integer,
  service_count integer,
  order_count integer,
  payment_count integer,
  cash_count integer
)
language sql
security definer
set search_path=public
as $$
  select
    s.id,
    s.label,
    s.created_at,
    s.created_by,
    jsonb_array_length(coalesce(s.customers,'[]'::jsonb))::integer,
    jsonb_array_length(coalesce(s.services,'[]'::jsonb))::integer,
    jsonb_array_length(coalesce(s.orders,'[]'::jsonb))::integer,
    jsonb_array_length(coalesce(s.payments,'[]'::jsonb))::integer,
    jsonb_array_length(coalesce(s.cash_transactions,s.cash_entries,'[]'::jsonb))::integer
  from public.v113035_safety_snapshots s
  where public.v113037_is_owner()
  order by s.created_at desc
  limit 50
$$;

grant execute on function public.v113037_list_safety_snapshots() to authenticated;

create or replace function public.v113037_restore_safety_snapshot(
  p_snapshot_id bigint,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  s public.v113035_safety_snapshots%rowtype;
  pre_id bigint;
  expected text;
  restored_orders integer:=0;
begin
  if not public.v113037_is_owner() then
    raise exception 'Hanya Owner yang dapat melakukan Restore.';
  end if;

  expected:='RESTORE SNAPSHOT '||p_snapshot_id::text;
  if upper(trim(coalesce(p_confirmation,'')))<>expected then
    raise exception 'Konfirmasi Restore tidak sesuai.';
  end if;

  select * into s
  from public.v113035_safety_snapshots
  where id=p_snapshot_id;

  if s.id is null then
    raise exception 'Safety Snapshot tidak ditemukan.';
  end if;

  -- Wajib: amankan kondisi sekarang terlebih dahulu.
  pre_id:=public.v113037_create_safety_snapshot(
    'AUTO sebelum restore #'||p_snapshot_id::text||' • '||to_char(now() at time zone 'Asia/Jakarta','DD/MM/YYYY HH24:MI')
  );

  -- Restore berada dalam satu transaksi database. Jika satu langkah gagal,
  -- seluruh perubahan di bawah otomatis rollback.
  if to_regclass('public.v1129_payment_proofs') is not null then
    execute 'delete from public.v1129_payment_proofs where id is not null';
  end if;
  if to_regclass('public.v100_payments') is not null then
    execute 'delete from public.v100_payments where id is not null';
  end if;
  if to_regclass('public.v100_order_items') is not null then
    execute 'delete from public.v100_order_items where id is not null';
  end if;
  if to_regclass('public.v100_orders') is not null then
    execute 'delete from public.v100_orders where id is not null';
  end if;
  if to_regclass('public.v100_cash_transactions') is not null then
    execute 'delete from public.v100_cash_transactions where id is not null';
  end if;
  if to_regclass('public.v100_customers') is not null then
    execute 'delete from public.v100_customers where id is not null';
  end if;
  if to_regclass('public.v100_services') is not null then
    execute 'delete from public.v100_services where id is not null';
  end if;

  if jsonb_array_length(coalesce(s.customers,'[]'::jsonb))>0 then
    insert into public.v100_customers
    select * from jsonb_populate_recordset(null::public.v100_customers,s.customers);
  end if;

  if jsonb_array_length(coalesce(s.services,'[]'::jsonb))>0 then
    insert into public.v100_services
    select * from jsonb_populate_recordset(null::public.v100_services,s.services);
  end if;

  if jsonb_array_length(coalesce(s.orders,'[]'::jsonb))>0 then
    insert into public.v100_orders
    select * from jsonb_populate_recordset(null::public.v100_orders,s.orders);
  end if;

  if jsonb_array_length(coalesce(s.order_items,'[]'::jsonb))>0 then
    insert into public.v100_order_items
    select * from jsonb_populate_recordset(null::public.v100_order_items,s.order_items);
  end if;

  if jsonb_array_length(coalesce(s.payments,'[]'::jsonb))>0 then
    insert into public.v100_payments
    select * from jsonb_populate_recordset(null::public.v100_payments,s.payments);
  end if;

  if to_regclass('public.v100_cash_transactions') is not null
     and jsonb_array_length(coalesce(s.cash_transactions,'[]'::jsonb))>0 then
    insert into public.v100_cash_transactions
    select * from jsonb_populate_recordset(null::public.v100_cash_transactions,s.cash_transactions);
  end if;

  select count(*) into restored_orders from public.v100_orders;

  insert into public.v113035_audit_log(table_name,record_id,action,old_data,new_data)
  values(
    'v113035_safety_snapshots',
    p_snapshot_id::text,
    'UPDATE',
    jsonb_build_object('pre_restore_snapshot_id',pre_id),
    jsonb_build_object('restored_snapshot_id',p_snapshot_id,'orders_restored',restored_orders)
  );

  return jsonb_build_object(
    'ok',true,
    'message','Restore Safety Snapshot #'||p_snapshot_id::text||' berhasil.',
    'restored_snapshot_id',p_snapshot_id,
    'pre_restore_snapshot_id',pre_id,
    'orders_restored',restored_orders
  );
end;
$$;

revoke all on function public.v113037_restore_safety_snapshot(bigint,text) from public;
grant execute on function public.v113037_restore_safety_snapshot(bigint,text) to authenticated;

notify pgrst,'reload schema';
