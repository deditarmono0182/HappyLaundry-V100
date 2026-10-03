-- HappyLaundry V113.0.72 - Gaji Saya (C1: data dasar)
create or replace function public.v113072_my_payroll_base(p_payroll_month date)
returns jsonb
language plpgsql stable security definer set search_path=public
as $$
declare
  v_emp uuid;
  v_start date:=date_trunc('month',p_payroll_month)::date;
  v_end date:=(date_trunc('month',p_payroll_month)+interval '1 month - 1 day')::date;
  v_result jsonb;
begin
  select id into v_emp from public.v109_current_employee() limit 1;
  if v_emp is null then raise exception 'Sesi karyawan tidak ditemukan.'; end if;

  select jsonb_build_object(
    'employee',jsonb_build_object('id',u.id,'full_name',u.full_name,'login_id',u.login_id),
    'payroll_month',v_start,
    'present_days',(select count(*) from public.v111_attendance where employee_id=v_emp and attendance_date between v_start and v_end and status='present'),
    'permission_days',(select count(*) from public.v111_attendance where employee_id=v_emp and attendance_date between v_start and v_end and status='permission'),
    'sick_days',(select count(*) from public.v111_attendance where employee_id=v_emp and attendance_date between v_start and v_end and status='sick'),
    'absent_days',(select count(*) from public.v111_attendance where employee_id=v_emp and attendance_date between v_start and v_end and status='absent'),
    'attendance_rate',coalesce(ps.attendance_rate,0),
    'allowance',coalesce(ps.monthly_allowance,0),
    'bonus',coalesce((select sum(bonus) from public.v111_payroll_adjustments where employee_id=v_emp and payroll_month=v_start),0),
    'cash_advance_applied',coalesce((select sum(amount) from public.v113072_cash_advance_deductions where employee_id=v_emp and payroll_month=v_start),0),
    'cash_advance_outstanding',coalesce((select sum(remaining_amount) from public.v113072_employee_cash_advances where employee_id=v_emp),0),
    'cash_advance_history',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'amount',a.amount,'remaining_amount',a.remaining_amount,'note',a.note,'issued_at',a.issued_at) order by a.issued_at desc) from public.v113072_employee_cash_advances a where a.employee_id=v_emp),'[]'::jsonb),
    'paid_amount',coalesce((select sum(amount) from public.v113_payroll_payments where employee_id=v_emp and payroll_month=v_start),0),
    'payment_history',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'amount',p.amount,'payment_method',p.payment_method,'note',p.note,'paid_at',p.paid_at) order by p.paid_at desc) from public.v113_payroll_payments p where p.employee_id=v_emp and p.payroll_month=v_start),'[]'::jsonb)
  ) into v_result
  from public.v109_users u
  left join public.v111_employee_payroll_settings ps on ps.employee_id=u.id
  where u.id=v_emp;

  return coalesce(v_result,'{}'::jsonb);
end;
$$;
grant execute on function public.v113072_my_payroll_base(date) to authenticated;
notify pgrst,'reload schema';
