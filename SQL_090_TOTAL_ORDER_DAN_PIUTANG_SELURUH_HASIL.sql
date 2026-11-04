-- HappyLaundry V113.0.170. Jalankan setelah SQL 079.
-- Hanya fungsi baca. Tidak mengubah order, pembayaran, komisi, login atau GPS.
begin;
create or replace function public.v113170_order_matches(p_query text default '',p_start_date date default null,p_end_date date default null,p_filters jsonb default '{}')
returns setof public.v100_orders_view language sql stable security invoker set search_path=public as $$
 select (jsonb_populate_record(null::public.v100_orders_view,to_jsonb(o)||jsonb_build_object(
  'payment_status',case when greatest(0,o.total-o.paid_amount)<=0 then 'paid' when o.paid_amount>0 then 'partial' else 'unpaid' end
 ))).* from public.v100_orders_view o
 where auth.uid() is not null
 and (p_start_date is null or o.created_at >= (p_start_date::timestamp at time zone 'Asia/Jakarta'))
 and (p_end_date is null or o.created_at < ((p_end_date+1)::timestamp at time zone 'Asia/Jakarta'))
 and (
   coalesce(btrim(p_query),'')='' or
   position(lower(btrim(p_query)) in lower(concat_ws(' ',o.order_no,o.customer_name,o.customer_phone,o.status,(case when greatest(0,o.total-o.paid_amount)<=0 then 'paid' when o.paid_amount>0 then 'partial' else 'unpaid' end),
     case o.status when 'received' then 'Diterima' when 'washing' then 'Dicuci' when 'drying' then 'Dikeringkan'
      when 'ironing' then 'Disetrika' when 'packing' then 'Packing' when 'ready' then 'Siap Diambil'
      when 'completed' then 'Selesai' when 'cancelled' then 'Dibatalkan' end,
     case (case when greatest(0,o.total-o.paid_amount)<=0 then 'paid' when o.paid_amount>0 then 'partial' else 'unpaid' end) when 'unpaid' then 'Belum Bayar' when 'partial' then 'DP / Sebagian' when 'paid' then 'Lunas' end)))>0
   or exists(select 1 from public.v100_order_items i
     left join public.v100_services s on lower(btrim(s.name))=lower(btrim(i.service_name))
     where i.order_id=o.id and position(lower(btrim(p_query)) in lower(concat_ws(' ',i.service_name,i.quantity::text,i.unit,s.category)))>0)
 )
 and (coalesce(p_filters->>'payment','all')='all' or (o.status<>'cancelled' and
  (case when greatest(0,o.total-o.paid_amount)<=0 then 'paid' when o.paid_amount>0 then 'partial' else 'unpaid' end)=p_filters->>'payment'))
 and (coalesce(p_filters->>'status','all')='all' or o.status=p_filters->>'status' or
  (p_filters->>'status'='overdue' and o.status not in('ready','completed','cancelled') and o.due_at<now()))
 and (coalesce(p_filters->>'category','all')='all' or exists(
  select 1 from public.v100_order_items i join public.v100_services s on lower(btrim(s.name))=lower(btrim(i.service_name))
  where i.order_id=o.id and lower(btrim(s.category))=lower(btrim(p_filters->>'category'))))
 and (coalesce(p_filters->>'assignment','all')='all' or
  (p_filters->>'assignment'='missing_worker' and not exists(select 1 from public.v113_order_commissions a where a.order_id=o.id and a.worker_id is not null)) or
  (p_filters->>'assignment'='missing_courier' and not exists(select 1 from public.v113_order_commissions a where a.order_id=o.id and a.courier_id is not null)) or
  (p_filters->>'assignment'='missing_any' and (not exists(select 1 from public.v113_order_commissions a where a.order_id=o.id and a.worker_id is not null) or not exists(select 1 from public.v113_order_commissions a where a.order_id=o.id and a.courier_id is not null))) or
  (p_filters->>'assignment'='missing_both' and not exists(select 1 from public.v113_order_commissions a where a.order_id=o.id and (a.worker_id is not null or a.courier_id is not null))))
 and (coalesce(p_filters->>'attention','all')='all' or
  (p_filters->>'attention'='ready_long' and o.status='ready' and coalesce(o.progress_last_at,o.due_at,o.created_at)<=now()-interval '24 hours') or
  (p_filters->>'attention'='no_due' and o.status not in('ready','completed','cancelled') and o.due_at is null))
;
$$;
revoke all on function public.v113170_order_matches(text,date,date,jsonb) from public,anon;
grant execute on function public.v113170_order_matches(text,date,date,jsonb) to authenticated;
create or replace function public.v113170_search_orders(p_query text default '',p_limit integer default 101,p_offset integer default 0,p_start_date date default null,p_end_date date default null,p_filters jsonb default '{}')
returns setof public.v100_orders_view language sql stable security invoker set search_path=public as $$
 select * from public.v113170_order_matches(p_query,p_start_date,p_end_date,p_filters)
 order by created_at desc,id desc
 limit least(greatest(coalesce(p_limit,101),1),200) offset greatest(coalesce(p_offset,0),0);
$$;
revoke all on function public.v113170_search_orders(text,integer,integer,date,date,jsonb) from public,anon;
grant execute on function public.v113170_search_orders(text,integer,integer,date,date,jsonb) to authenticated;
create or replace function public.v113170_order_search_summary(p_query text default '',p_start_date date default null,p_end_date date default null,p_filters jsonb default '{}')
returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object(
 'count',count(*),'ready',count(*) filter(where status='ready'),
 'overdue',count(*) filter(where status not in('ready','completed','cancelled') and due_at<now()),
 'receivable',coalesce(sum(greatest(0,total-paid_amount)) filter(where status<>'cancelled'),0),
 'unpaid_count',count(*) filter(where status<>'cancelled' and total>paid_amount))
 from public.v113170_order_matches(p_query,p_start_date,p_end_date,p_filters);
$$;
revoke all on function public.v113170_order_search_summary(text,date,date,jsonb) from public,anon;
grant execute on function public.v113170_order_search_summary(text,date,date,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
