-- HappyLaundry V113.0.165. Jalankan setelah SQL 085.
-- Hanya index dan RPC baca ringkasan. Tidak mengubah transaksi, login atau absensi.
begin;
create index if not exists v113165_orders_created on public.v100_orders(created_at,id);
create index if not exists v113165_payments_created on public.v100_payments(created_at,id);
create index if not exists v113165_items_order on public.v100_order_items(order_id);
create index if not exists v113165_attendance_date on public.v111_attendance(attendance_date,employee_id);
create index if not exists v113165_expenses_date on public.v106_expenses(expense_date);

create or replace function public.v113165_financial_summary(p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.v113122_can_manage_cash_advance() then raise exception 'Akses Keuangan diperlukan';end if;
 if p_from is null or p_to is null or p_from>p_to then raise exception 'Periode laporan tidak valid';end if;
 with bounds as (
  select p_from::timestamp at time zone 'Asia/Jakarta' lo,(p_to+1)::timestamp at time zone 'Asia/Jakarta' hi
 ), months as (
  select m::date month_key,
   (least(p_to,(m+interval '1 month - 1 day')::date)-greatest(p_from,m::date)+1)::numeric/extract(day from m+interval '1 month - 1 day') ratio
  from generate_series(date_trunc('month',p_from::timestamp),date_trunc('month',p_to::timestamp),interval '1 month') m
 ), orders as (
  select o.id,greatest(0,o.total) total,o.paid_amount from public.v100_orders_view o,bounds b
  where o.created_at>=b.lo and o.created_at<b.hi and o.status<>'cancelled'
 ), items as (
  select i.order_id,i.service_id,i.subtotal,sum(greatest(0,i.subtotal)) over(partition by i.order_id) item_total
  from public.v100_order_items i join orders o on o.id=i.order_id
 ), category_values as (
  select coalesce(nullif(btrim(s.category),''),'Kiloan') category,o.total*greatest(0,i.subtotal)/i.item_total revenue
  from orders o join items i on i.order_id=o.id left join public.v100_services s on s.id=i.service_id
  where i.item_total>0 and i.subtotal>0
  union all select 'Kiloan',o.total from orders o where not exists(select 1 from items i where i.order_id=o.id and i.subtotal>0)
 ), category_totals as (select category,sum(revenue) revenue from category_values group by category),
 manager_months as materialized (
  -- Avoid calculating a full monthly profit base where no manager has a positive share.
  select m.month_key,m.ratio,public.v113151_profit_base(m.month_key) base from months m
  where exists(select 1 from public.v113151_manager_shares s where s.payroll_month=m.month_key and s.share_percent>0)
 ), amounts as (
  select
  coalesce((select sum(total) from orders),0) revenue,
  coalesce((select sum(p.amount) from public.v100_payments p,bounds b where p.created_at>=b.lo and p.created_at<b.hi),0) cash_in,
  coalesce((select sum(greatest(0,total-coalesce(paid_amount,0))) from orders),0) receivable,
  coalesce((select sum(e.amount) from public.v106_expenses_view e where e.expense_date between p_from and p_to
   and lower(coalesce(e.category_name,'')||' '||coalesce(e.group_name,'')) !~ '(gaji|payroll|komisi|tunjangan|bonus|bagi hasil|sdm)'),0) operating,
  coalesce((select sum(s.attendance_rate) from public.v111_attendance a join public.v111_employee_payroll_settings s on s.employee_id=a.employee_id
   where a.status='present' and a.attendance_date between p_from and p_to),0) attendance_pay,
  coalesce((select sum(monthly_allowance) from public.v111_employee_payroll_settings),0)*coalesce((select sum(ratio) from months),0) allowance,
  coalesce((select sum(a.bonus*m.ratio) from public.v111_payroll_adjustments a join months m on m.month_key=date_trunc('month',a.payroll_month)::date where a.payroll_month>=date_trunc('month',p_from)::date and a.payroll_month<=date_trunc('month',p_to)::date),0) bonus,
  coalesce((select sum(c.revenue*s.share_percent/100.0) from category_totals c join public.v111_employee_revenue_shares s on s.category=c.category),0) revenue_share,
  coalesce((select sum(c.amount) from public.v113_commission_ledger c,bounds b where c.commission_type='production' and c.earned_at>=b.lo and c.earned_at<b.hi),0) production_commission,
  coalesce((select sum(c.amount) from public.v113_commission_ledger c,bounds b where c.commission_type='courier' and c.earned_at>=b.lo and c.earned_at<b.hi),0) courier_commission,
  coalesce((select sum(round(greatest(0,(m.base->>'profit_base')::numeric)*s.share_percent/100.0,2)*m.ratio)
   from manager_months m join public.v113151_manager_shares s on s.payroll_month=m.month_key),0) manager_share
 ), totals as (
  select *,attendance_pay+allowance+bonus+revenue_share+production_commission+courier_commission+manager_share employee_cost from amounts
 ), final as (
  select *,coalesce((select sum(case when r.method='percent_revenue' then t.revenue*r.revenue_percent/100.0
   else r.monthly_amount*coalesce((select sum(ratio) from months),0) end) from public.v113095_reserve_settings r where r.is_active),0) reserve_total from totals t
 ) select jsonb_build_object(
  'revenue',revenue,'cashIn',cash_in,'receivable',receivable,'operating',operating,
  'attendancePay',attendance_pay,'allowance',allowance,'bonus',bonus,'revenueShare',revenue_share,
  'productionCommission',production_commission,'courierCommission',courier_commission,'managerShare',manager_share,
  'profitBeforeManager',revenue-operating-employee_cost+manager_share,'employeeCost',employee_cost,
  'operatingNet',revenue-operating-employee_cost,'reserveTotal',reserve_total,
  'netAfterReserve',revenue-operating-employee_cost-reserve_total,'cashOperatingSurplus',cash_in-operating-employee_cost
 ) into result from final;
 return result;
end;$$;
revoke all on function public.v113165_financial_summary(date,date) from public,anon;
grant execute on function public.v113165_financial_summary(date,date) to authenticated;
notify pgrst,'reload schema';
commit;
