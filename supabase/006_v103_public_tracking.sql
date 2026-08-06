-- HappyLaundry Enterprise V103.0
-- Tracking publik aman untuk QR nota.
-- Jalankan setelah SQL 001 sampai 005.

create or replace function public.v103_public_order_tracking(p_order_no text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'order_no', o.order_no,
    'customer_name',
      case
        when length(trim(c.name)) <= 2 then trim(c.name)
        else left(trim(c.name), 2) || repeat('*', greatest(1, least(8, length(trim(c.name))-2)))
      end,
    'status', o.status,
    'payment_status', o.payment_status,
    'total', o.total,
    'paid_amount', o.paid_amount,
    'due_at', o.due_at,
    'created_at', o.created_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'service_name', i.service_name,
        'unit', i.unit,
        'quantity', i.quantity
      ) order by i.created_at)
      from public.v100_order_items i
      where i.order_id = o.id
    ), '[]'::jsonb),
    'business_name', coalesce(s.business_name, 'HappyLaundry Babakan'),
    'phone', coalesce(s.phone, ''),
    'address', coalesce(s.address, ''),
    'maps_url', coalesce(s.maps_url, ''),
    'operational_hours', coalesce(s.operational_hours, '')
  )
  from public.v100_orders o
  join public.v100_customers c on c.id = o.customer_id
  left join public.v100_store_settings s on s.id = 1
  where upper(o.order_no) = upper(trim(p_order_no))
    and o.status <> 'cancelled'
  limit 1;
$$;

revoke all on function public.v103_public_order_tracking(text) from public;
grant execute on function public.v103_public_order_tracking(text) to anon, authenticated;

notify pgrst, 'reload schema';
