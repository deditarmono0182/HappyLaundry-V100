-- HappyLaundry Enterprise V110.6
-- QR Center Permission Fix
-- Jalankan SETELAH SQL V109/V110 sebelumnya.
--
-- Tujuan:
-- QR Center tidak lagi SELECT langsung ke v100_orders_view.
-- Order dicari melalui SECURITY DEFINER RPC yang memeriksa hak akses QR Center.

create or replace function public.v110_can_use_qr_center()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select
    exists(
      select 1
      from public.profiles p
      where p.id=auth.uid()
        and p.role='owner'
    )
    or
    exists(
      select 1
      from public.v109_users u
      where u.auth_uid=auth.uid()
        and u.is_active=true
        and u.qr_center=true
    );
$$;

revoke all on function public.v110_can_use_qr_center() from public;
grant execute on function public.v110_can_use_qr_center() to authenticated;

drop function if exists public.v110_qr_find_order(text);

create or replace function public.v110_qr_find_order(p_order_no text)
returns table(
  id uuid,
  order_no text,
  customer_id uuid,
  customer_name text,
  customer_phone text,
  status text,
  payment_status text,
  subtotal numeric,
  discount numeric,
  total numeric,
  paid_amount numeric,
  notes text,
  due_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_order_no text:=upper(btrim(coalesce(p_order_no,'')));
begin
  if auth.uid() is null then
    raise exception 'Permission denied: login diperlukan.';
  end if;

  if not public.v110_can_use_qr_center() then
    raise exception 'Permission denied: akun tidak memiliki akses QR Center.';
  end if;

  if v_order_no='' then
    return;
  end if;

  return query
  select
    o.id,
    o.order_no,
    o.customer_id,
    o.customer_name,
    o.customer_phone,
    o.status::text,
    o.payment_status::text,
    o.subtotal,
    o.discount,
    o.total,
    o.paid_amount,
    o.notes,
    o.due_at,
    o.created_at
  from public.v100_orders_view o
  where upper(o.order_no)=v_order_no
  limit 1;
end;
$$;

revoke all on function public.v110_qr_find_order(text) from public;
grant execute on function public.v110_qr_find_order(text) to authenticated;

-- Optional audit entry when QR/manual search successfully finds an employee order.
-- Owner searches are not written here because the employee audit table is employee-focused.
create or replace function public.v110_qr_find_order_with_audit(p_order_no text)
returns setof public.v100_orders_view
language plpgsql
security definer
set search_path=public
as $$
declare
  v_order_no text:=upper(btrim(coalesce(p_order_no,'')));
  v_employee public.v109_users%rowtype;
begin
  if auth.uid() is null or not public.v110_can_use_qr_center() then
    raise exception 'Permission denied';
  end if;

  select * into v_employee
  from public.v109_users
  where auth_uid=auth.uid()
    and is_active=true
  limit 1;

  if found then
    insert into public.v109_audit_log(
      employee_id,login_id,full_name,action,entity_type,entity_id,details
    )
    values(
      v_employee.id,v_employee.login_id,v_employee.full_name,
      'QR_SEARCH','order',v_order_no,'QR Center mencari order'
    );
  end if;

  return query
  select *
  from public.v100_orders_view
  where upper(order_no)=v_order_no
  limit 1;
end;
$$;

-- Fungsi audit alternatif tidak dipakai frontend V110.6,
-- jadi tidak diberi grant publik untuk menjaga surface area kecil.
revoke all on function public.v110_qr_find_order_with_audit(text) from public;

notify pgrst,'reload schema';
