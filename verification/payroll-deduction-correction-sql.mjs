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
create table v113072_cash_advance_deductions(id uuid primary key default gen_random_uuid(),cash_advance_id uuid,employee_id uuid,payroll_month date,amount numeric check(amount>0),created_at timestamptz default now(),created_by uuid default auth.uid());
create table v113_payroll_payments(employee_id uuid,payroll_month date,amount numeric);
create table v113072_employee_cash_advances(id uuid primary key default gen_random_uuid(),employee_id uuid,amount numeric check(amount>0),remaining_amount numeric check(remaining_amount>=0),cancelled_at timestamptz,issued_at timestamptz default now());
create table v109_audit_log(employee_id uuid,full_name text,action text,entity_type text,entity_id text,details text);
insert into v109_users values('${a}','CECE ADI R','A',true),('${b}','Pekerja','B',true);
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

await db.exec(await readFile('supabase/080_v113_0_151_manager_profit_share.sql','utf8'))
const migration=await readFile('supabase/081_v113_0_152_correct_payroll_deduction.sql','utf8')
await db.exec(migration)
const l1='10000000-0000-0000-0000-000000000001',l2='10000000-0000-0000-0000-000000000002',lb='10000000-0000-0000-0000-000000000003'
await db.exec(`update v111_employee_payroll_settings set monthly_allowance=2052200 where employee_id='${a}';
insert into v113072_employee_cash_advances(id,employee_id,amount,remaining_amount,issued_at) values
('${l1}','${a}',2000000,0,'2026-10-02'),('${l2}','${a}',2800000,2737800,'2026-10-03'),('${lb}','${b}',100000,90000,'2026-09-02');
insert into v113072_cash_advance_deductions(cash_advance_id,employee_id,payroll_month,amount,created_at) values
('${l1}','${a}','2026-10-01',2000000,'2026-10-02'),('${l2}','${a}','2026-10-01',62200,'2026-10-03'),('${lb}','${b}','2026-09-01',10000,'2026-09-03');`)
const sum=async(table,col,id=a,month=null)=>Number((await db.query(`select coalesce(sum(${col}),0) n from ${table} where employee_id=$1${month?' and payroll_month=$2':''}`,[id,...(month?[month]:[])])).rows[0].n)
const correct=(old,value,id=a,month='2026-10-01',reason='Salah input potongan, sesuai kesepakatan')=>db.query('select v113152_correct_payroll_deduction($1,$2,$3,$4,$5) r',[id,month,old,value,reason])
const snapshot=async()=>({loans:(await db.query('select * from v113072_employee_cash_advances order by id')).rows,deductions:(await db.query('select * from v113072_cash_advance_deductions order by id')).rows,audits:(await db.query('select * from v113152_deduction_corrections order by id')).rows})
let r=(await correct(2062200,300000)).rows[0].r
assert.equal(r.new_amount,300000);assert.equal(r.new_remaining,4500000)
assert.equal(await sum('v113072_cash_advance_deductions','amount',a,'2026-10-01'),300000)
assert.equal(await sum('v113072_employee_cash_advances','amount'),4800000,'original principal unchanged')
assert.equal(await sum('v113072_cash_advance_deductions','amount',b,'2026-09-01'),10000,'other employee/month unchanged')
let audit=(await db.query('select * from v113152_deduction_corrections')).rows[0]
assert.equal(audit.before_details.deductions.length,2);assert.equal(audit.after_details.deductions.length,1,'removed deduction preserved in audit')
assert.equal(Number(audit.old_amount),2062200);assert.equal(Number(audit.new_amount),300000)
// Repeated submit with the old value cannot refund twice.
let before=await snapshot();await assert.rejects(correct(2062200,300000),/sudah berubah/);assert.deepEqual(await snapshot(),before)
await correct(300000,400000);assert.equal(await sum('v113072_employee_cash_advances','remaining_amount'),4400000)
await correct(400000,0);assert.equal(await sum('v113072_cash_advance_deductions','amount',a,'2026-10-01'),0);assert.equal(await sum('v113072_employee_cash_advances','remaining_amount'),4800000)
await correct(0,300000);assert.equal(await sum('v113072_employee_cash_advances','remaining_amount'),4500000)
// Invalid/cross month/authorization inputs cannot mutate data.
before=await snapshot()
for(const args of [[300000,-1],[300000,'NaN'],[300000,300000],[300000,3000000],[300000,100000,a,'2026-10-02'],[300000,100000,a,'2026-10-01','x'],[300000,100000,a,'2026-09-01']])await assert.rejects(correct(...args))
assert.deepEqual(await snapshot(),before)
await db.exec(`insert into v113_payroll_payments values('${a}','2026-10-01',1)`)
await assert.rejects(correct(300000,100000),/sudah memiliki pembayaran/);assert.deepEqual(await snapshot(),before)
await db.exec('delete from v113_payroll_payments')
// Reject increases beyond remaining debt, even with sufficient salary.
await db.exec(`update v111_employee_payroll_settings set monthly_allowance=10000000 where employee_id='${a}'`)
await assert.rejects(correct(300000,5000000),/melebihi sisa utang/)
await db.exec(`set test.owner='false'`);await assert.rejects(correct(300000,100000),/Hanya Owner/)
await db.exec('set role authenticated')
await assert.rejects(db.query(`select v113152_salary_capacity($1,'2026-10-01')`,[a]),/permission denied/)
await assert.rejects(db.query(`delete from v113152_deduction_corrections`),/permission denied/)
assert.equal((await db.query('select * from v113152_deduction_corrections')).rows.length,0,'RLS hides correction history from employee')
await db.exec(`reset role;set test.owner='true'`)
// If a loan would exceed principal, the entire transaction rolls back, including earlier loop updates.
await db.exec(`update v113072_employee_cash_advances set amount=100000 where id='${l1}'`)
before=await snapshot();await assert.rejects(correct(300000,0),/melebihi nilai pinjaman/);assert.deepEqual(await snapshot(),before)
await db.exec(migration);assert.deepEqual(await snapshot(),before,'rerunning migration never edits financial data')
await db.close()
console.log('PASS V152 SQL: Cece 2,062,200 -> 300,000 and debt4.5m; principal unchanged; increase/zero/reapply; other employee/month intact; immutable before/after audit; stale double-submit rejected; paid salary blocked; salary/debt caps; owner-only and RLS; invalid input rollback; inconsistent-loan rollback; migration idempotent.')
