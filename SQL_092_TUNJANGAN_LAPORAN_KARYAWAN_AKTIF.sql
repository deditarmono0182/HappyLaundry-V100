-- HappyLaundry V113.0.172. Jalankan setelah SQL091.
-- Hanya koreksi tunjangan laporan mulai November 2026. Tanpa mengubah transaksi.
begin;
do $$declare definition text;begin
 if to_regclass('public.v113171_commission_policy') is null then
  raise exception 'Jalankan SQL091 terlebih dahulu.';
 end if;
 if to_regprocedure('public.v113172_financial_summary_legacy(date,date)') is null then
  definition:=pg_get_functiondef('public.v113165_financial_summary(date,date)'::regprocedure);
  definition:=replace(definition,'FUNCTION public.v113165_financial_summary(', 'FUNCTION public.v113172_financial_summary_legacy(');
  if position('FUNCTION public.v113172_financial_summary_legacy(' in definition)=0 then
   raise exception 'Rumus ringkasan lama tidak dapat disimpan; tidak ada perubahan diterapkan.';
  end if;
  execute definition;
 end if;
end$$;
revoke all on function public.v113172_financial_summary_legacy(date,date) from public,anon,authenticated;

create or replace function public.v113165_financial_summary(p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare b jsonb;excluded numeric;ratio numeric;delta numeric;
begin
 -- Original function retains period validation and finance authorization.
 b:=public.v113172_financial_summary_legacy(p_from,p_to);
 if p_to<date '2026-11-01' then return b;end if;
 select coalesce(sum(s.monthly_allowance),0) into excluded
 from public.v111_employee_payroll_settings s
 where not exists(select 1 from public.v109_users u where u.id=s.employee_id and u.is_active=true);
 select coalesce(sum(
  (least(p_to,(m+interval '1 month - 1 day')::date)-greatest(p_from,m::date)+1)::numeric
  /extract(day from m+interval '1 month - 1 day')),0) into ratio
 from generate_series(date_trunc('month',greatest(p_from,date '2026-11-01')::timestamp),
  date_trunc('month',p_to::timestamp),interval '1 month') m;
 delta:=excluded*ratio;
 return b||jsonb_build_object(
  'allowance',(b->>'allowance')::numeric-delta,
  'employeeCost',(b->>'employeeCost')::numeric-delta,
  'profitBeforeManager',(b->>'profitBeforeManager')::numeric+delta,
  'operatingNet',(b->>'operatingNet')::numeric+delta,
  'netAfterReserve',(b->>'netAfterReserve')::numeric+delta,
  'cashOperatingSurplus',(b->>'cashOperatingSurplus')::numeric+delta);
end$$;
revoke all on function public.v113165_financial_summary(date,date) from public,anon;
grant execute on function public.v113165_financial_summary(date,date) to authenticated;
notify pgrst,'reload schema';
commit;
-- Pemeriksaan tunjangan bulanan: sumber aktif vs nonaktif.
select coalesce(u.is_active,false) karyawan_aktif,count(*) jumlah_pengaturan,
 coalesce(sum(s.monthly_allowance),0) tunjangan_bulanan
from public.v111_employee_payroll_settings s left join public.v109_users u on u.id=s.employee_id
group by 1 order by 1 desc;
