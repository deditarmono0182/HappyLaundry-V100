-- HappyLaundry V113.0.72 - Gaji Saya (C2: komisi order)
create or replace function public.v113072_my_commissions(p_payroll_month date)
returns table(order_id uuid,order_no text,commission_type text,base_amount numeric,percent numeric,amount numeric,earned_at timestamptz)
language plpgsql stable security definer set search_path=public
as $$
declare
  v_emp uuid;
  v_start date:=date_trunc('month',p_payroll_month)::date;
  v_end date:=(date_trunc('month',p_payroll_month)+interval '1 month')::date;
begin
  select id into v_emp from public.v109_current_employee() limit 1;
  if v_emp is null then raise exception 'Sesi karyawan tidak ditemukan.'; end if;
  return query
  select l.order_id,l.order_no,l.commission_type,l.base_amount,l.percent,l.amount,l.earned_at
  from public.v113_commission_ledger l
  where l.employee_id=v_emp and l.earned_at>=v_start::timestamptz and l.earned_at<v_end::timestamptz
  order by l.earned_at desc;
end;
$$;
grant execute on function public.v113072_my_commissions(date) to authenticated;
notify pgrst,'reload schema';
