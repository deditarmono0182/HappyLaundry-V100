-- HappyLaundry V113.0.72 - Gaji Saya (C3: bagi hasil kategori)
create or replace function public.v113072_my_revenue_share(p_payroll_month date)
returns numeric
language plpgsql stable security definer set search_path=public
as $$
declare
  v_emp uuid;
  v_start date:=date_trunc('month',p_payroll_month)::date;
  v_end date:=(date_trunc('month',p_payroll_month)+interval '1 month')::date;
  v_total numeric:=0;
begin
  select id into v_emp from public.v109_current_employee() limit 1;
  if v_emp is null then raise exception 'Sesi karyawan tidak ditemukan.'; end if;

  select coalesce(sum(rs.share_percent/100.0 * coalesce(cat.revenue,0)),0) into v_total
  from public.v111_employee_revenue_shares rs
  left join lateral (
    select coalesce(sum(p.amount*(oi.subtotal/nullif(t.total_items,0))),0) revenue
    from public.v100_payments p
    join public.v100_order_items oi on oi.order_id=p.order_id
    left join public.v100_services s on s.id=oi.service_id
    join lateral (select sum(x.subtotal) total_items from public.v100_order_items x where x.order_id=p.order_id) t on true
    where p.created_at>=v_start::timestamptz and p.created_at<v_end::timestamptz
      and coalesce(nullif(btrim(s.category),''),'Kiloan')=rs.category
  ) cat on true
  where rs.employee_id=v_emp;

  return coalesce(v_total,0);
end;
$$;
grant execute on function public.v113072_my_revenue_share(date) to authenticated;
notify pgrst,'reload schema';
