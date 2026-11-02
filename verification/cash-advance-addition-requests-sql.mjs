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

const id='00000000-0000-0000-0000-000000000001',actor='00000000-0000-0000-0000-000000000099'
await db.exec(`create table profiles(id uuid,full_name text);insert into profiles values('${actor}','OWNER');insert into v109_users values('${id}','CECE','CECE',true);insert into v111_employee_payroll_settings values('${id}',0,1000000);create function v109_current_employee() returns setof v109_users language sql security definer as $$select * from v109_users limit 1$$;`)

const sql=await readFile('SQL_085_PENGAJUAN_TAMBAHAN_KASBON.sql','utf8');await db.exec(sql);await db.exec(sql)
const state=async()=>({loans:(await db.query('select * from v113072_employee_cash_advances order by id')).rows,cash:(await db.query('select * from v100_cash_transactions order by amount,description')).rows,payroll:(await db.query('select * from v113_payroll_payments')).rows,deductions:(await db.query('select * from v113072_cash_advance_deductions')).rows})
const submit=(rid,amount=2000000,method='transfer',employee=id)=>db.query('select v113163_request_additional_cash_advance($1,$2,$3,$4,$5,$6) r',[rid,employee,amount,method,'Kebutuhan keluarga','Memerlukan tambahan kasbon'])
const review=(rid,approve=true)=>db.query('select v113163_review_additional_cash_advance($1,$2,$3) r',[rid,approve,'Sudah diperiksa Owner'])
await db.exec("set test.actor='finance';set role authenticated")
const rid=crypto.randomUUID()
await submit(rid);await submit(rid)
assert.equal((await db.query('select count(*) n from v113163_cash_advance_addition_requests')).rows[0].n,1)
await assert.rejects(submit(rid,2000001),/data berbeda/)
await assert.rejects(review(rid),/Hanya Owner/)
await assert.rejects(db.exec("update v113163_cash_advance_addition_requests set status='approved'"),/permission denied/)
await db.exec('reset role');assert.equal((await state()).loans.length,0);assert.equal((await state()).cash.length,0)
// Approval must use CURRENT salary capacity and the original loan + cash transaction routines.
await db.exec(`update v111_employee_payroll_settings set monthly_allowance=300000;set test.actor='owner';set role authenticated`)
const approved=(await review(rid)).rows[0].r
assert.equal(approved.status,'approved');assert.ok(approved.cash_advance_id);assert.equal(Number(approved.capacity_at_request.salary_available),1000000);assert.equal(Number(approved.capacity_at_review.salary_available),300000)
await review(rid);await db.exec('reset role')
let s=await state();assert.equal(s.loans.length,1);assert.equal(s.cash.length,1);assert.equal(Number(s.loans[0].amount),2000000);assert.equal(Number(s.loans[0].remaining_amount),2000000);assert.equal(s.cash[0].method,'transfer');assert.equal(s.cash[0].kind,'expense');assert.equal(s.cash[0].category,'Kas Bon Karyawan');assert.equal(Number(s.cash[0].amount),2000000)
const audit=(await db.query('select * from v113137_cash_advance_approvals')).rows;assert.equal(audit.length,1);assert.equal(audit[0].cash_advance_id,approved.cash_advance_id);assert.equal(Number(audit[0].excess),1700000);assert.match(audit[0].reason,/Memerlukan tambahan kasbon/)
assert.deepEqual(s.payroll,[]);assert.deepEqual(s.deductions,[])
// Ordinary Finance creation remains blocked over salary; requests do not bypass the guard.
await db.exec("set test.actor='finance';set role authenticated")
await assert.rejects(db.query('select v113137_add_cash_advance($1,100000,null,\'cash\',null,false)',[id]),/Hanya Owner/)
let rejectId=crypto.randomUUID();await submit(rejectId,50000,'cash');await db.exec("set test.actor='owner'")
await db.exec('reset role');const before=JSON.stringify(await state());await review(rejectId,false);await review(rejectId,false);assert.equal(JSON.stringify(await state()),before);await assert.rejects(review(rejectId,true),/sudah diputuskan/)
// Approval failure must roll back both the loan and request status, allowing a safe retry.
await db.exec('reset role');await db.exec('alter table v100_cash_transactions add constraint test_cash_failure check(amount<>123456)')
const failureId=crypto.randomUUID();await submit(failureId,123456);const beforeFailure=JSON.stringify(await state());await assert.rejects(review(failureId),/test_cash_failure/);assert.equal(JSON.stringify(await state()),beforeFailure);assert.equal((await db.query('select status from v113163_cash_advance_addition_requests where id=$1',[failureId])).rows[0].status,'pending')
await db.exec('alter table v100_cash_transactions drop constraint test_cash_failure');await review(failureId);await review(failureId);assert.equal((await state()).loans.length,2)
// Inactive targets: reject creation; if deactivated while pending, owner may reject but not approve.
const inactiveId=crypto.randomUUID();await submit(inactiveId,50000);await db.exec(`update v109_users set is_active=false where id='${id}'`)
await assert.rejects(submit(crypto.randomUUID()),/nonaktif/);await assert.rejects(review(inactiveId),/nonaktif/);await review(inactiveId,false)
await db.exec(`update v109_users set is_active=true where id='${id}'`)
for(const amount of [0,-1,1.001,'NaN','Infinity'])await assert.rejects(submit(crypto.randomUUID(),amount),/Nominal/)
await assert.rejects(submit(crypto.randomUUID(),100,'invalid'),/Metode/)
await db.exec("set test.actor='none';set role authenticated");assert.equal((await db.query('select count(*) n from v113163_cash_advance_addition_requests')).rows[0].n,0);await assert.rejects(submit(crypto.randomUUID()),/Akses Keuangan/)
await db.exec("set test.actor='finance'");assert.ok((await db.query('select count(*) n from v113163_cash_advance_addition_requests')).rows[0].n>0)
await db.exec('reset role');assert.equal((await state()).payroll.length,0);assert.equal((await state()).deductions.length,0)
console.log('PASS SQL085: real SQL066/072 salary guard and cash ledger; over-salary request no financial change; Finance read/request only; owner approval/reject; current capacity audit; retry creates one loan + cash-out; failed cash insertion rolls everything back; active-employee recheck; amount validation; immutable RLS; payroll/deductions untouched.')
await db.close()
