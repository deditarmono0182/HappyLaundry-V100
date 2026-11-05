import {PGlite} from '@electric-sql/pglite'
import {readFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const db=new PGlite()
await db.exec(`create role anon;create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function v113122_can_manage_cash_advance() returns boolean language sql stable as $$select coalesce(current_setting('test.finance',true),'')='yes'$$;
create table v113171_commission_policy(singleton boolean);
create table v109_users(id int,is_active boolean);
create table v111_employee_payroll_settings(employee_id int,attendance_rate numeric,monthly_allowance numeric);
create table v100_orders_view(id int,total numeric,paid_amount numeric,status text,created_at timestamptz);
create table v100_order_items(order_id int,service_id int,subtotal numeric);
create table v100_services(id int,category text);
create table v100_payments(amount numeric,created_at timestamptz);
create table v106_expenses_view(amount numeric,expense_date date,category_name text,group_name text);
create table v111_attendance(employee_id int,attendance_date date,status text);
create table v111_payroll_adjustments(employee_id int,payroll_month date,bonus numeric);
create table v111_employee_revenue_shares(employee_id int,category text,share_percent numeric);
create table v113_commission_ledger(employee_id int,commission_type text,amount numeric,earned_at timestamptz);
create table v113151_manager_shares(payroll_month date,share_percent numeric);
create function v113151_profit_base(date) returns jsonb language sql as $$select '{"profit_base":0}'::jsonb$$;
create table v113095_reserve_settings(is_active boolean,method text,monthly_amount numeric,revenue_percent numeric);
insert into v109_users values(1,true),(2,false),(3,true);
insert into v111_employee_payroll_settings values(1,10000,100000),(2,10000,10000),(3,10000,100000);
insert into v111_attendance select 1,'2026-11-03','present' from generate_series(1,27);
insert into v113_commission_ledger values(1,'production',610517.5,'2026-11-04T00:00+07'),(3,'courier',447370,'2026-11-05T00:00+07');
insert into v100_orders_view values(1,6075250,0,'received','2026-11-03T00:00+07');
insert into v100_payments values(5821810,'2026-11-03T00:00+07');
insert into v106_expenses_view values(1318000,'2026-11-03','Operasional','Operasional');
insert into v113095_reserve_settings values(true,'monthly',2015050,0);
set test.uid='00000000-0000-0000-0000-000000000001';set test.finance='yes';`)
const original=await readFile('supabase/086_v113_0_165_fast_financial_summary.sql','utf8')
await db.exec(original.slice(original.indexOf('create or replace function public.v113165_financial_summary'),original.indexOf("notify pgrst")))
const read=async(from,to)=>(await db.query('select v113165_financial_summary($1,$2) b',[from,to])).rows[0].b
const before=await read('2026-11-01','2026-11-06'),oct=await read('2026-10-01','2026-10-31'),mixed=await read('2026-10-31','2026-11-06')
assert.equal(before.allowance,42000);assert.equal(Math.round(before.employeeCost),1369888)
const sql=await readFile('SQL_092_TUNJANGAN_LAPORAN_KARYAWAN_AKTIF.sql','utf8')
await db.exec(sql);await db.exec(sql)
const after=await read('2026-11-01','2026-11-06')
assert.equal(after.allowance,40000);assert.equal(Math.round(after.employeeCost),1367888)
for(const k of ['profitBeforeManager','operatingNet','netAfterReserve','cashOperatingSurplus'])assert.equal(after[k]-before[k],2000,k)
for(const k of ['revenue','cashIn','receivable','operating','attendancePay','bonus','revenueShare','productionCommission','courierCommission','managerShare','reserveTotal'])assert.equal(after[k],before[k],k)
assert.deepEqual(await read('2026-10-01','2026-10-31'),oct)
assert.equal(mixed.allowance-(await read('2026-10-31','2026-11-06')).allowance,2000)
assert.equal((await read('2026-11-01','2026-11-30')).allowance,200000)
assert.equal((await read('2026-12-01','2026-12-31')).allowance,200000)
// Reactivating an account follows the same current-active rule as the payroll roster.
await db.exec('update v109_users set is_active=true where id=2');assert.equal((await read('2026-11-01','2026-11-06')).allowance,42000)
await db.exec('set role authenticated');assert.equal((await read('2026-11-01','2026-11-06')).allowance,42000)
await assert.rejects(db.query("select v113172_financial_summary_legacy('2026-11-01','2026-11-06')"),/permission denied/)
await db.exec("set test.finance='no'");await assert.rejects(read('2026-11-01','2026-11-06'),/Akses Keuangan/)
await db.exec("set test.finance='yes';set test.uid=''");await assert.rejects(read('2026-11-01','2026-11-06'),/Akses Keuangan/)
await db.exec('reset role;set role anon');await assert.rejects(read('2026-11-01','2026-11-06'),/permission denied/)
await db.close();console.log('PASS SQL092: actual SQL086 reproduces 42000/1369888 screenshot, corrected 40000/1367888, exact delta all derived totals, other components unchanged, historical October unchanged, mixed months, month lengths, reactivation, idempotence, finance/session/anon permissions.')
