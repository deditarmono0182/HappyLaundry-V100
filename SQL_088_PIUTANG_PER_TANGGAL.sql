-- HappyLaundry V113.0.168 — laporan piutang historis, hanya baca.
-- Memerlukan tabel audit SQL 045 dan akses Keuangan SQL 066 yang sudah ada.
-- Tidak mengubah order, pembayaran, login, absensi, gaji, atau kasbon.
begin;
create index if not exists v113168_receivable_audit_cutoff
 on public.v113035_audit_log(table_name,created_at,id);
create index if not exists v113168_receivable_payment_order
 on public.v100_payments(order_id,created_at);

create or replace function public.v113168_receivables_as_of(p_as_of date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare cutoff timestamptz;result jsonb;
begin
 if auth.uid() is null or not public.v113122_can_manage_cash_advance() then
  raise exception 'Akses Keuangan diperlukan.';
 end if;
 if p_as_of is null or p_as_of>(now() at time zone 'Asia/Jakarta')::date then
  raise exception 'Pilih tanggal piutang yang valid, paling akhir hari ini.';
 end if;
 cutoff:=(p_as_of+1)::timestamp at time zone 'Asia/Jakarta';
 with first_changes as materialized (
  -- old_data pada perubahan pertama SETELAH batas adalah keadaan tepat pada batas.
  -- INSERT setelah batas memiliki old_data NULL: record belum ada pada tanggal itu.
  select distinct on(table_name,record_id) table_name,record_id,old_data,id
  from public.v113035_audit_log
  where table_name in('v100_orders','v100_payments') and created_at>=cutoff
  order by table_name,record_id,created_at,id
 ), order_snapshots as (
  select case when a.id is not null then a.old_data else to_jsonb(o) end d,
   o.id is not null exists_now
  from public.v100_orders o full join
   (select * from first_changes where table_name='v100_orders') a on a.record_id=o.id::text
 ), payment_snapshots as (
  select case when a.id is not null then a.old_data else to_jsonb(p) end d
  from public.v100_payments p full join
   (select * from first_changes where table_name='v100_payments') a on a.record_id=p.id::text
 ), paid as (
  select d->>'order_id' order_id,sum((d->>'amount')::numeric) amount
  from payment_snapshots where d is not null and (d->>'created_at')::timestamptz<cutoff
  group by d->>'order_id'
 ), outstanding as (
  select o.d||jsonb_build_object(
   'customer_name',coalesce(c.name,'Pelanggan tidak tersedia'),
   'customer_phone',coalesce(c.phone,''),
   'paid_amount',coalesce(p.amount,0),
   'payment_status',case when coalesce(p.amount,0)>0 then 'partial' else 'unpaid' end,
   '_exists_now',o.exists_now
  ) row_data,
  greatest(0,(o.d->>'total')::numeric-coalesce(p.amount,0)) remaining,
  (o.d->>'created_at')::timestamptz created_at,o.d->>'id' order_id
  from order_snapshots o
  left join paid p on p.order_id=o.d->>'id'
  left join public.v100_customers c on c.id::text=o.d->>'customer_id'
  where o.d is not null and (o.d->>'created_at')::timestamptz<cutoff
   and o.d->>'status'<>'cancelled'
   and (o.d->>'total')::numeric-coalesce(p.amount,0)>0
 )
 select jsonb_build_object('as_of',p_as_of,'rows',
  coalesce(jsonb_agg(row_data order by created_at desc,order_id),'[]'::jsonb),
  'total',coalesce(sum(remaining),0),'count',count(*)) into result from outstanding;
 return result;
end;$$;
revoke all on function public.v113168_receivables_as_of(date) from public,anon;
grant execute on function public.v113168_receivables_as_of(date) to authenticated;
notify pgrst,'reload schema';
commit;
