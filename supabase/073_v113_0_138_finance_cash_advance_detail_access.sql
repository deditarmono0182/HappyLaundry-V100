-- HappyLaundry V113.0.138 — Akses baca detail kasbon bagi staf Keuangan.
-- Jalankan setelah SQL 072. Saldo dan transaksi lama tidak diubah.
-- Persetujuan over kasbon dan alasan audit Owner tetap khusus Owner.
begin;
create or replace function public.v113134_owner_cash_advance_report()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if not public.v113122_can_manage_cash_advance() then
    raise exception 'Laporan kasbon memerlukan akses Keuangan.';
  end if;
  return jsonb_build_object(
    'employees',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',u.id,'name',u.full_name,'login_id',u.login_id,'active',u.is_active
      ) order by u.full_name)
      from public.v109_users u
    ),'[]'::jsonb),
    'advances',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'employee_id',a.employee_id,'amount',a.amount,
        'remaining_amount',a.remaining_amount,'note',a.note,'issued_at',a.issued_at,
        'cancelled_at',a.cancelled_at
      ) order by a.issued_at desc)
      from public.v113072_employee_cash_advances a
    ),'[]'::jsonb),
    'deductions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',d.id,'employee_id',d.employee_id,'cash_advance_id',d.cash_advance_id,
        'amount',d.amount,'payroll_month',d.payroll_month,'created_at',d.created_at
      ) order by d.created_at desc)
      from public.v113072_cash_advance_deductions d
    ),'[]'::jsonb),
    'corrections',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,'employee_id',c.employee_id,'cash_advance_id',c.cash_advance_id,
        'old_amount',c.old_amount,'new_amount',c.new_amount,'old_remaining',c.old_remaining,
        'new_remaining',c.new_remaining,'reason',c.reason,'corrected_at',c.corrected_at
      ) order by c.corrected_at desc)
      from public.v113123_cash_advance_corrections c
    ),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.v113134_owner_cash_advance_report() from public,anon;
grant execute on function public.v113134_owner_cash_advance_report() to authenticated;
create or replace function public.v113137_cash_advance_limits(p_employee_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_result jsonb;
begin
 if not public.v113122_can_manage_cash_advance() then raise exception 'Akses Keuangan diperlukan.'; end if;
 select coalesce(jsonb_agg(public.v113137_salary_capacity(u.id)||jsonb_build_object('approvals',case when public.v109_is_owner() then coalesce((select jsonb_agg(to_jsonb(a) order by a.approved_at desc) from public.v113137_cash_advance_approvals a where a.employee_id=u.id),'[]'::jsonb) else '[]'::jsonb end)),'[]'::jsonb) into v_result
 from public.v109_users u where (p_employee_id is null or u.id=p_employee_id);
 return v_result;
end; $$;
revoke all on function public.v113137_cash_advance_limits(uuid) from public,anon;
grant execute on function public.v113137_cash_advance_limits(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
