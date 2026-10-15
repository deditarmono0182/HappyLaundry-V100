-- HappyLaundry V113.0.134 / SQL 071 — Laporan Kasbon Seluruh Karyawan
-- READ ONLY: menambah satu fungsi laporan; tidak mengubah saldo atau transaksi.
-- Jalankan setelah SQL 067 (corrections) dan SQL 070.
begin;
alter table public.v113072_employee_cash_advances
  add column if not exists cancelled_at timestamptz null;

create or replace function public.v113134_owner_cash_advance_report()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if not public.v109_is_owner() then
    raise exception 'Laporan kasbon seluruh karyawan hanya untuk Owner.';
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
notify pgrst,'reload schema';
commit;
