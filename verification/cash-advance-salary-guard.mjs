// Execute the actual migration and existing RPCs in an isolated PostgreSQL engine.
import {PGlite} from '@electric-sql/pglite'
import {readFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const db=new PGlite()
await db.exec(`create role anon;create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql as $$select '00000000-0000-0000-0000-000000000099'::uuid$$;
create function public.v109_is_owner() returns boolean language sql as $$select current_setting('test.actor',true)='owner'$$;
create function public.v113122_can_manage_cash_advance() returns boolean language sql as $$select current_setting('test.actor',true) in ('owner','finance')$$;
create table v109_users(id uuid primary key,full_name text,login_id text,is_active boolean);
create table v111_employee_payroll_settings(employee_id uuid,attendance_rate numeric,monthly_allowance numeric);
create table v111_attendance(employee_id uuid,attendance_date date,status text);
create table v111_payroll_adjustments(employee_id uuid,payroll_month date,bonus numeric);
create table v111_employee_revenue_shares(employee_id uuid,category text,share_percent numeric);
create table v113_commission_ledger(employee_id uuid,earned_at timestamptz,amount numeric);
create table v113_payroll_payments(employee_id uuid,payroll_month date,amount numeric);
create table v100_orders_view(id uuid,total numeric,status text,created_at timestamptz);
create table v100_order_items(order_id uuid,service_id uuid,subtotal numeric);
create table v100_services(id uuid,category text);
create table v113072_employee_cash_advances(id uuid primary key default gen_random_uuid(),employee_id uuid references v109_users(id),amount numeric,remaining_amount numeric,note text,issued_at timestamptz default now(),created_by uuid,cancelled_at timestamptz);
create table v113072_cash_advance_deductions(id uuid default gen_random_uuid(),cash_advance_id uuid,employee_id uuid,payroll_month date,amount numeric,created_at timestamptz default now());
create table v100_cash_transactions(kind text,category text,description text,amount numeric,method text,created_by uuid);
set test.actor='owner';`)
const original=await readFile('supabase/059b_v113_0_72_cash_advance_functions.sql','utf8')
await db.exec(original.slice(0,original.indexOf('create or replace function public.v113072_apply')))
const finance=await readFile('supabase/066_v113_0_122_employee_finance_cash_advance.sql','utf8')
await db.exec(finance.slice(finance.indexOf('create or replace function public.v113122_add_cash_advance(')))
await db.exec(await readFile('supabase/067_v113_0_123_owner_cash_advance_correction.sql','utf8'))
await db.exec(await readFile('supabase/072_v113_0_137_cash_advance_salary_guard.sql','utf8'))
// Migration is repeatable.
await db.exec(await readFile('supabase/072_v113_0_137_cash_advance_salary_guard.sql','utf8'))
const id='00000000-0000-0000-0000-000000000001',order='00000000-0000-0000-0000-000000000002'
await db.exec(`insert into v109_users values('${id}','Robet','robet',true);
insert into v111_employee_payroll_settings values('${id}',100000,100000);
insert into v111_attendance select '${id}',date_trunc('month',now() at time zone 'Asia/Jakarta')::date,'present' from generate_series(1,10);
insert into v111_payroll_adjustments values('${id}',date_trunc('month',now() at time zone 'Asia/Jakarta')::date,100000);
insert into v113_commission_ledger values('${id}',now(),100000);
insert into v111_employee_revenue_shares values('${id}','Kiloan',10);
insert into v100_orders_view values('${order}',2000000,'received',now());
insert into v113072_cash_advance_deductions(employee_id,payroll_month,amount) values('${id}',date_trunc('month',now() at time zone 'Asia/Jakarta')::date,100000);
insert into v113_payroll_payments values('${id}',date_trunc('month',now() at time zone 'Asia/Jakarta')::date,100000);`)
const capacity=async()=> (await db.query(`select v113137_salary_capacity('${id}') value`)).rows[0].value
assert.equal((await capacity()).gross,1500000)
assert.equal((await capacity()).salary_available,1300000)
// Category allocation, cancelled orders, and WIB month boundaries.
await db.exec(`insert into v100_services values('00000000-0000-0000-0000-000000000011','Kiloan'),('00000000-0000-0000-0000-000000000012','Satuan');
insert into v100_orders_view values('00000000-0000-0000-0000-000000000003',1000000,'received',now()),('00000000-0000-0000-0000-000000000004',10000000,'cancelled',now());
insert into v100_order_items values('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000011',100),('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000012',300);
insert into v113_commission_ledger values('${id}',(date_trunc('month',now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta')-interval '1 second',500000),('${id}',(date_trunc('month',now() at time zone 'Asia/Jakarta')+interval '1 month') at time zone 'Asia/Jakarta',500000);`)
assert.equal((await capacity()).gross,1525000,'weighted category share; cancelled orders and other months excluded')
await db.exec(`delete from v100_order_items;delete from v100_orders_view where id<>'${order}';
insert into v113072_employee_cash_advances(employee_id,amount,remaining_amount,cancelled_at) values('${id}',9000000,9000000,now());`)
assert.equal((await capacity()).outstanding,0,'cancelled loans excluded')

await db.query(`select v113122_add_cash_advance('${id}',600000)`)
await db.exec(`set test.actor='finance'`)
await assert.rejects(()=>db.query(`select v113122_add_cash_advance('${id}',700001)`),/melebihi gaji/)
await assert.rejects(()=>db.query(`select v113137_add_cash_advance('${id}',700001,null,'cash','Setuju owner')`),/Hanya Owner/)
await db.query(`select v113137_add_cash_advance('${id}',700000)`)
assert.equal((await capacity()).outstanding,1300000,'exact boundary allowed')
await assert.rejects(()=>db.query(`select v113137_add_cash_advance('${id}',50000)`),/melebihi gaji/)
await db.exec(`set test.actor='owner'`)
await assert.rejects(()=>db.query(`select v113072_add_cash_advance('${id}',50000)`),/melebihi gaji/)
await assert.rejects(()=>db.query(`insert into v113072_employee_cash_advances(employee_id,amount,remaining_amount) values('${id}',50000,50000)`),/melebihi gaji/)
await assert.rejects(()=>db.query(`select v113137_add_cash_advance('${id}',50000,null,'cash','ok')`),/melebihi gaji/)
const approved=(await db.query(`select v113137_add_cash_advance('${id}',50000,null,'cash','Darurat keluarga') id`)).rows[0].id
assert.equal((await capacity()).excess,50000)
let audit=(await db.query('select * from v113137_cash_advance_approvals')).rows
assert.equal(audit.length,1);assert.equal(Number(audit[0].excess),50000);assert.equal(audit[0].reason,'Darurat keluarga')
await assert.rejects(()=>db.query(`select v113123_owner_correct_cash_advance('${approved}',60000,null,'Koreksi angka')`),/melebihi gaji/)
await db.query(`select v113137_correct_cash_advance('${approved}',60000,null,'Koreksi nominal disetujui')`)
assert.equal((await capacity()).excess,60000)
await db.query(`update v113072_employee_cash_advances set remaining_amount=0 where id='${approved}'`)
assert.equal((await capacity()).outstanding,1300000,'repayment is not blocked')
await db.exec(`set test.actor='finance'`)
await assert.rejects(()=>db.query('select v113137_cash_advance_limits()'),/Hanya Owner/)
const limited=(await db.query(`select v113137_cash_advance_limits('${id}') value`)).rows[0].value
assert.equal(limited[0].approvals.length,0,'finance cannot read owner audit reasons')
await db.exec(`set test.actor='employee'`)
await assert.rejects(()=>db.query(`select v113137_cash_advance_limits('${id}')`),/Akses Keuangan/)
await db.exec(`set test.actor='owner'`)
const report=(await db.query('select v113137_cash_advance_limits() value')).rows[0].value
assert.equal(report[0].approvals.length,2)
await assert.rejects(()=>db.query(`select v113137_add_cash_advance('${id}',1)`),/melebihi gaji/,'approval does not leak to next call')
console.log('PASS: actual SQL migration twice; salary components; exact limit; finance block; legacy RPC/direct insert block; owner reason; audit; correction; repayment; permissions; override isolation.')
// V138: finance staff may read reports, but approval authority remains Owner.
await db.exec(await readFile('supabase/071_v113_0_134_owner_cash_advance_report.sql','utf8'))
await db.exec(await readFile('supabase/073_v113_0_138_finance_cash_advance_detail_access.sql','utf8'))
await db.exec(await readFile('supabase/073_v113_0_138_finance_cash_advance_detail_access.sql','utf8'))
await db.exec(`set test.actor='finance'`)
const financeReport=(await db.query('select v113134_owner_cash_advance_report() value')).rows[0].value
assert.equal(financeReport.employees[0].name,'Robet');assert.ok(financeReport.advances.length>=3)
const financeLimits=(await db.query('select v113137_cash_advance_limits() value')).rows[0].value
assert.equal(financeLimits.length,1);assert.equal(financeLimits[0].approvals.length,0)
await assert.rejects(()=>db.query(`select v113137_add_cash_advance('${id}',1,null,'cash','Alasan staff')`),/Hanya Owner/)
await assert.rejects(()=>db.query(`select v113137_correct_cash_advance('${approved}',70000,null,'Alasan staff')`),/Hanya Owner/)
await db.exec(`set test.actor='employee'`)
await assert.rejects(()=>db.query('select v113134_owner_cash_advance_report()'),/akses Keuangan/)
await assert.rejects(()=>db.query('select v113137_cash_advance_limits()'),/Akses Keuangan/)
await db.exec(`set test.actor='owner'`)
assert.equal((await db.query('select v113137_cash_advance_limits() value')).rows[0].value[0].approvals.length,2)
console.log('PASS V138: migration repeatable; finance report and all limits accessible; Owner audit stays private; staff cannot approve/correct; unauthorized users denied.')
await db.close()
