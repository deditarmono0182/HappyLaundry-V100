import {PGlite} from '@electric-sql/pglite'
import {readFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const db=new PGlite(),a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002'
await db.exec(`create role anon;create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql as $$select '${a}'::uuid$$;
create function public.v109_is_owner() returns boolean language sql as $$select coalesce(current_setting('test.owner',true),'true')='true'$$;
create function public.v113122_can_manage_cash_advance() returns boolean language sql as $$select v109_is_owner()$$;
create table v109_users(id uuid primary key,full_name text,login_id text,is_active boolean);
create function v109_current_employee() returns setof v109_users language sql as $$select * from v109_users where id='${a}'$$;
create table v100_orders_view(id uuid primary key,total numeric,paid_amount numeric,status text,created_at timestamptz);
create table v100_order_items(order_id uuid,service_id uuid,subtotal numeric);
create table v100_services(id uuid,category text);
create table v106_expenses_view(expense_date date,category_name text,group_name text,amount numeric);
create table v111_attendance(employee_id uuid,attendance_date date,status text);
create table v111_employee_payroll_settings(employee_id uuid,attendance_rate numeric,monthly_allowance numeric);
create table v111_payroll_adjustments(employee_id uuid,payroll_month date,bonus numeric);
create table v111_employee_revenue_shares(employee_id uuid,category text,share_percent numeric);
create table v113_commission_ledger(employee_id uuid,commission_type text,amount numeric,earned_at timestamptz);
create table v113072_cash_advance_deductions(employee_id uuid,payroll_month date,amount numeric);
create table v113_payroll_payments(employee_id uuid,payroll_month date,amount numeric);
create table v113072_employee_cash_advances(employee_id uuid,remaining_amount numeric,cancelled_at timestamptz);
create table v109_audit_log(employee_id uuid,full_name text,action text,entity_type text,entity_id text,details text);
insert into v109_users values('${a}','Pengelola','A',true),('${b}','Pekerja','B',true);
insert into v111_employee_payroll_settings values('${a}',10000,20000),('${b}',20000,10000);
insert into v111_attendance values('${a}','2026-10-01','present'),('${a}','2026-10-02','sick'),('${b}','2026-10-01','present');
insert into v111_payroll_adjustments values('${b}','2026-10-01',5000);
insert into v111_employee_revenue_shares values('${b}','Kiloan',5);
insert into v106_expenses_view values('2026-10-01','Listrik','Operasional',100000),('2026-10-01','Gaji Karyawan','SDM',999999),('2026-10-01','Cadangan THR','Cadangan',777777);
insert into v113_commission_ledger values('${b}','production',20000,'2026-10-02T00:00:00+07:00'),('${b}','courier',10000,'2026-10-02T00:00:00+07:00');
insert into v100_orders_view select md5(n::text)::uuid,1000,0,'received','2026-10-02T00:00:00+07:00' from generate_series(1,1200) n;
insert into v100_orders_view values(md5('cancelled')::uuid,999999,0,'cancelled','2026-10-02T00:00:00+07:00'),(md5('sep')::uuid,999999,0,'received','2026-09-30T23:59:59+07:00');
insert into v100_order_items select id,null,total from v100_orders_view;
`)
const migration=await readFile('supabase/080_v113_0_151_manager_profit_share.sql','utf8')
await db.exec(migration)
const report=async(month='2026-10-01')=>(await db.query('select v113151_manager_report($1) r',[month])).rows[0].r
const save=async(id=a,pct=40,month='2026-10-01')=>db.query('select v113151_save_manager_share($1,$2,$3)',[month,id,pct])
let r=await report();assert.equal(r.revenue,1200000);assert.equal(r.operating,100000);assert.equal(r.employee_cost,155000);assert.equal(r.profit_base,945000);assert.deepEqual(r.rows,[])
await save();r=await report();assert.equal(r.rows[0].amount,378000);assert.equal(r.rows[0].percent,40)
// Saved payments/deductions/receivable do not change earned profit rights.
await db.exec(`insert into v113_payroll_payments values('${a}','2026-10-01',100000);insert into v113072_cash_advance_deductions values('${a}','2026-10-01',50000);update v100_orders_view set paid_amount=total;`)
assert.equal((await report()).rows[0].amount,378000)
await save(a,35);assert.equal((await report()).rows[0].amount,330750)
assert.equal((await report('2026-09-01')).rows.length,0)
await save(a,40,'2026-11-01');assert.equal((await report()).rows[0].percent,35,'next month change preserves October')
await save(b,60);assert.equal((await report()).rows.length,2)
await assert.rejects(save(a,50),/100%/);assert.equal((await report()).rows.find(r=>r.employee_id===a).percent,35,'rejected total does not write')
for(const pct of [-1,101,'NaN'])await assert.rejects(save(a,pct),/valid/)
// A loss produces no negative salary or circular share.
await db.exec(`insert into v106_expenses_view values('2026-10-03','Sewa','Operasional',2000000)`)
assert.ok((await report()).rows.every(r=>r.amount===0))
await db.exec(`delete from v106_expenses_view where category_name='Sewa';set test.owner='false'`)
await assert.rejects(report(),/Akses Keuangan/);await assert.rejects(save(),/Owner/)
const mine=(await db.query(`select v113151_my_manager_share('2026-10-01') r`)).rows[0].r
assert.deepEqual(Object.keys(mine).sort(),['amount','percent']);assert.equal(mine.amount,330750)
// Execute permissions: employee cannot call an internal profit function or write settings.
await db.exec('set role authenticated')
await assert.rejects(db.query(`select v113151_profit_base('2026-10-01')`),/permission denied/)
await assert.rejects(db.query(`update v113151_manager_shares set share_percent=99`),/permission denied/)
await db.exec(`reset role;set test.owner='true'`)
assert.equal((await db.query(`select count(*)::int n from v109_audit_log`)).rows[0].n,4)
await db.exec(migration);assert.equal((await report()).rows.find(r=>r.employee_id===a).amount,330750,'migration is rerunnable')
// Current month salary capacity includes manager rights and existing deductions exactly once.
const curr=(await db.query(`select date_trunc('month',now() at time zone 'Asia/Jakarta')::date::text m`)).rows[0].m
if(curr!=='2026-10-01'){
 await db.query(`insert into v100_orders_view values(md5('current')::uuid,1000000,0,'received',$1::date::timestamp at time zone 'Asia/Jakarta')`,[curr]);await save(a,40,curr)
}
const capacity=(await db.query(`select v113137_salary_capacity($1) r`,[a])).rows[0].r
const manager=(await db.query(`select v113151_manager_amount($1,$2) n`,[a,curr])).rows[0].n
const original=(await db.query(`select v113151_salary_capacity_base($1) r`,[a])).rows[0].r
assert.equal(capacity.gross,original.gross+Number(manager))
assert.equal(capacity.salary_available,Math.max(0,capacity.gross-capacity.deductions-capacity.salary_paid))
await db.close()
console.log('PASS V151 SQL: >1000 unpaid orders, WIB bounds, cancelled orders, all salary/commission costs once, reserves excluded, editable monthly %, multi-manager cap, no circular costs, payment independence, zero loss share, access restrictions, own-only response, audit, rerunnable SQL, kasbon capacity.')
