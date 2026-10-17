-- HappyLaundry V113.0.144 / SQL 079. Setelah SQL 078.
-- Pencarian seluruh order yang boleh dibaca pengguna. Tidak mengubah data/komisi.
begin;
create or replace function public.v113144_search_orders(p_query text,p_limit integer default 101,p_offset integer default 0,p_start_date date default null,p_end_date date default null)
returns setof public.v100_orders_view
language sql stable security invoker set search_path=public
as $$
 select o.* from public.v100_orders_view o
 where auth.uid() is not null
 and (p_start_date is null or o.created_at >= (p_start_date::timestamp at time zone 'Asia/Jakarta'))
 and (p_end_date is null or o.created_at < ((p_end_date+1)::timestamp at time zone 'Asia/Jakarta'))
 and (
   coalesce(btrim(p_query),'')='' or
   position(lower(btrim(p_query)) in lower(concat_ws(' ',o.order_no,o.customer_name,o.customer_phone,o.status,o.payment_status,
     case o.status when 'received' then 'Diterima' when 'washing' then 'Dicuci' when 'drying' then 'Dikeringkan'
      when 'ironing' then 'Disetrika' when 'packing' then 'Packing' when 'ready' then 'Siap Diambil'
      when 'completed' then 'Selesai' when 'cancelled' then 'Dibatalkan' end,
     case o.payment_status when 'unpaid' then 'Belum Bayar' when 'partial' then 'DP / Sebagian' when 'paid' then 'Lunas' end)))>0
   or exists(select 1 from public.v100_order_items i
     left join public.v100_services s on lower(btrim(s.name))=lower(btrim(i.service_name))
     where i.order_id=o.id and position(lower(btrim(p_query)) in lower(concat_ws(' ',i.service_name,i.quantity::text,i.unit,s.category)))>0)
 )
 order by o.created_at desc,o.id desc
 limit least(greatest(coalesce(p_limit,101),1),200)
 offset greatest(coalesce(p_offset,0),0);
$$;
revoke all on function public.v113144_search_orders(text,integer,integer,date,date) from public,anon;
grant execute on function public.v113144_search_orders(text,integer,integer,date,date) to authenticated;
notify pgrst,'reload schema';
commit;
