-- HappyLaundry Enterprise V113.0.65
-- SQL 058 — Customer Detail Auto Mapping
-- Jalankan SETELAH SQL 057 dan SEBELUM deploy V113.0.65.

begin;

alter table public.v100_orders
  add column if not exists progress_mode text;

-- Nilai boleh null untuk order lama agar riwayat lama tidak ditebak.
alter table public.v100_orders
  drop constraint if exists v100_orders_progress_mode_check;

alter table public.v100_orders
  add constraint v100_orders_progress_mode_check
  check (progress_mode is null or progress_mode in ('quick','detail'));

create or replace function public.v113065_update_order_progress(
  p_order_id uuid,
  p_new_status text,
  p_mode text default 'quick'
)
returns table(
  ok boolean,
  old_status text,
  new_status text,
  actor_name text,
  changed_at timestamptz
)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_order public.v100_orders%rowtype;
  v_owner boolean := false;
  v_employee_id uuid;
  v_actor_name text;
  v_actor_login text;
  v_employee_can_production boolean := false;
  v_changed_at timestamptz := now();
  v_mode text := lower(coalesce(nullif(btrim(p_mode),''),'quick'));
begin
  if v_mode not in ('quick','detail') then
    raise exception 'Mode progres tidak valid.';
  end if;

  v_owner := public.v109_is_owner();

  if v_owner then
    select coalesce(nullif(btrim(p.full_name),''),'Owner')
      into v_actor_name
    from public.profiles p
    where p.id = auth.uid()
    limit 1;

    v_actor_name := coalesce(v_actor_name,'Owner');
    v_actor_login := 'OWNER';
  else
    select e.id, e.full_name, e.login_id, e.production
      into v_employee_id, v_actor_name, v_actor_login, v_employee_can_production
    from public.v109_current_employee() e
    limit 1;

    if coalesce(v_employee_can_production,false) = false then
      raise exception 'Akun ini tidak memiliki akses Produksi.';
    end if;
  end if;

  if coalesce(v_actor_name,'') = '' then
    raise exception 'Sesi pengguna tidak dikenali. Silakan login ulang.';
  end if;

  select * into v_order
  from public.v100_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order tidak ditemukan.';
  end if;

  if p_new_status not in ('washing','drying','ironing','packing','ready','completed') then
    raise exception 'Status tujuan tidak valid.';
  end if;

  -- Mode detail bergerak satu tahap. Mode cepat boleh lompat dari tahap produksi ke ready.
  if not (
    (v_order.status='received' and p_new_status='washing') or
    (v_order.status='washing' and p_new_status in ('drying','ready')) or
    (v_order.status='drying' and p_new_status in ('ironing','ready')) or
    (v_order.status='ironing' and p_new_status in ('packing','ready')) or
    (v_order.status='packing' and p_new_status='ready') or
    (v_order.status='ready' and p_new_status='completed')
  ) then
    raise exception 'Perubahan progres dari % ke % tidak diizinkan.', v_order.status, p_new_status;
  end if;

  update public.v100_orders
  set
    status = p_new_status,
    progress_mode = v_mode,
    progress_last_at = v_changed_at,
    progress_last_by_name = v_actor_name,
    progress_last_by_login_id = v_actor_login,
    updated_at = v_changed_at
  where id = p_order_id;

  insert into public.v113063_order_progress_history(
    order_id, order_no, old_status, new_status,
    actor_auth_uid, actor_employee_id, actor_name, actor_login_id, created_at
  ) values (
    v_order.id, v_order.order_no, v_order.status, p_new_status,
    auth.uid(), v_employee_id, v_actor_name, v_actor_login, v_changed_at
  );

  return query
  select true, v_order.status, p_new_status, v_actor_name, v_changed_at;
end;
$$;

grant execute on function public.v113065_update_order_progress(uuid,text,text) to authenticated;

-- View aplikasi membawa penanda mode progres untuk kebutuhan audit/UI berikutnya.
create or replace view public.v100_orders_view
with (security_invoker = true)
as
select
  o.id,
  o.order_no,
  o.customer_id,
  c.name as customer_name,
  c.phone as customer_phone,
  o.status,
  o.payment_status,
  o.subtotal,
  o.discount,
  o.total,
  o.paid_amount,
  o.notes,
  o.due_at,
  o.created_at,
  o.created_by_name,
  o.created_by_login_id,
  o.progress_last_at,
  o.progress_last_by_name,
  o.progress_last_by_login_id,
  o.progress_mode
from public.v100_orders o
join public.v100_customers c on c.id = o.customer_id;

grant select on public.v100_orders_view to authenticated;

-- Tracking publik tetap aman: nama pelanggan tetap dimasking seperti versi sebelumnya.
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
    'progress_mode', o.progress_mode,
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

commit;
