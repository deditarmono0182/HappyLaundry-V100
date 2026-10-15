-- HappyLaundry V113.0.139. Jalankan setelah SQL 073.
-- Ringkasan per karyawan, bukan daftar transaksi; seluruh saldo dihitung di DB.
begin;
create or replace function public.v113139_finance_cash_advance_summary()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_result jsonb;
begin
 if not public.v113122_can_manage_cash_advance() then
  raise exception 'Ringkasan kasbon memerlukan akses Keuangan.';
 end if;
 select coalesce(jsonb_agg(to_jsonb(s) order by s.remaining_amount desc,s.employee_name,s.employee_id),'[]'::jsonb) into v_result
 from (
  select u.id employee_id,u.full_name employee_name,
   sum(a.amount) amount,sum(a.remaining_amount) remaining_amount,
   greatest(0,sum(a.amount)-sum(a.remaining_amount)) paid_amount,
   count(*) transaction_count,count(*) filter(where a.remaining_amount>0) active_count
  from public.v113072_employee_cash_advances a
  join public.v109_users u on u.id=a.employee_id
  where a.cancelled_at is null
  group by u.id,u.full_name
 ) s;
 return v_result;
end; $$;
revoke all on function public.v113139_finance_cash_advance_summary() from public,anon;
grant execute on function public.v113139_finance_cash_advance_summary() to authenticated;
notify pgrst,'reload schema';
commit;
