-- HappyLaundry SQL 087 — samakan biaya dasar laba pengelola dengan daftar gaji aktif.
-- Jalankan setelah SQL 080 (dan setelah 086 jika sudah dipasang).
-- Hanya mengganti fungsi baca dasar laba; tidak mengubah/hapus transaksi,
-- absensi, tunjangan tersimpan, kasbon, komisi, atau pembayaran gaji.
-- Cakupan mengikuti status aktif SAAT laporan dibuka, sama seperti daftar gaji.
-- Hak pengelola dihitung ulang; pembayaran lama tetap tercatat.
begin;
create or replace function public.v113151_profit_base(p_month date)
returns jsonb language sql stable security definer set search_path=public as $$
 with bounds as (
 select date_trunc('month',p_month)::date m,
 date_trunc('month',p_month)::timestamp at time zone 'Asia/Jakarta' lo,
 (date_trunc('month',p_month)+interval '1 month')::timestamp at time zone 'Asia/Jakarta' hi
 ), active_employees as (
 select id from public.v109_users where is_active=true
 ), orders as (
 select o.id,greatest(0,o.total) total from public.v100_orders_view o,bounds b
 where o.status<>'cancelled' and o.created_at>=b.lo and o.created_at<b.hi
 ), items as (
 select i.*,sum(greatest(0,i.subtotal)) over(partition by i.order_id) item_total
 from public.v100_order_items i join orders o on o.id=i.order_id
 ), category_values as (
 select coalesce(nullif(btrim(s.category),''),'Kiloan') category,
 o.total*greatest(0,i.subtotal)/i.item_total revenue
 from orders o join items i on i.order_id=o.id left join public.v100_services s on s.id=i.service_id
 where i.item_total>0 and i.subtotal>0
 union all select 'Kiloan',o.total from orders o
 where not exists(select 1 from items i where i.order_id=o.id and i.subtotal>0)
 ), amounts as (
 select coalesce((select sum(total) from orders),0) revenue,
 coalesce((select sum(e.amount) from public.v106_expenses_view e,bounds b
 where e.expense_date>=b.m and e.expense_date<(b.m+interval '1 month')::date
 and lower(coalesce(e.category_name,'')||' '||coalesce(e.group_name,'')) !~ '(gaji|payroll|komisi|tunjangan|bonus|bagi hasil|sdm|cadangan)'),0) operating,
 coalesce((select sum(s.attendance_rate) from public.v111_attendance a
 join public.v111_employee_payroll_settings s on s.employee_id=a.employee_id,bounds b
 where a.employee_id in(select id from active_employees) and a.status='present' and a.attendance_date>=b.m and a.attendance_date<(b.m+interval '1 month')::date),0)
 +coalesce((select sum(monthly_allowance) from public.v111_employee_payroll_settings where employee_id in(select id from active_employees)),0)
 +coalesce((select sum(a.bonus) from public.v111_payroll_adjustments a,bounds b where a.employee_id in(select id from active_employees) and a.payroll_month=b.m),0)
 +coalesce((select sum(c.revenue*s.share_percent/100.0) from category_values c join public.v111_employee_revenue_shares s on s.category=c.category where s.employee_id in(select id from active_employees)),0)
 +coalesce((select sum(c.amount) from public.v113_commission_ledger c,bounds b where c.employee_id in(select id from active_employees) and c.earned_at>=b.lo and c.earned_at<b.hi),0) employee_cost
 ) select jsonb_build_object('revenue',revenue,'operating',operating,'employee_cost',employee_cost,'profit_base',revenue-operating-employee_cost) from amounts;
$$;
revoke all on function public.v113151_profit_base(date) from public,anon,authenticated;


notify pgrst,'reload schema';
commit;

-- Pengecekan Oktober 2026 setelah perbaikan (hanya baca).
-- Angka dapat berubah jika data/pengaturan Oktober kemudian dikoreksi.
select
 round((b->>'revenue')::numeric) as barang_order_masuk,
 round((b->>'operating')::numeric) as biaya_operasional,
 round((b->>'employee_cost')::numeric) as gaji_komisi_sebelum_pengelola,
 round((b->>'profit_base')::numeric) as dasar_laba_sebelum_pengelola
from (select public.v113151_profit_base(date '2026-10-01') b) hasil;
