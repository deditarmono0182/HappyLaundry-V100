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
const sql=await readFile('SQL_083_PENGAJUAN_KOREKSI_KASBON.sql','utf8');await db.exec(sql);await db.exec(sql)
const loan=(await db.query(`select v113137_add_cash_advance('${id}',200000,'Awal','cash',null,false) id`)).rows[0].id
const state=async()=>({loan:(await db.query('select amount,remaining_amount,note from v113072_employee_cash_advances where id=$1',[loan])).rows[0],cash:Number((await db.query('select count(*) n from v100_cash_transactions')).rows[0].n),deductions:(await db.query('select * from v113072_cash_advance_deductions')).rows,payments:(await db.query('select * from v113_payroll_payments')).rows})
const request=async(amount,reason='Salah nominal kasbon',note='Benar')=>{const s=await state();const rid=crypto.randomUUID();const args=[rid,loan,s.loan.amount,s.loan.remaining_amount,s.loan.note,amount,note,reason];return {rid,args,run:()=>db.query('select v113161_request_cash_advance_correction($1,$2,$3,$4,$5,$6,$7,$8) r',args)}}
const review=(rid,approve=true)=>db.query('select v113161_review_cash_advance_correction($1,$2,$3) r',[rid,approve,'Diperiksa sesuai bukti'])
await db.exec("set test.actor='finance'")
let r=await request(100000)
// State snapshots are inspected as the test DB owner, not via a new application grant.
await db.exec('reset role');const initial=await state();await db.exec('set role authenticated')
await r.run();await r.run();await assert.rejects(review(r.rid),/Hanya Owner/)
await assert.rejects(db.exec("update v113161_cash_advance_requests set status='approved'"),/permission denied/)
await db.exec('reset role');assert.deepEqual(await state(),initial,'pending/retry does not affect loan, salary, or cash')
await db.exec("set test.actor='owner';set role authenticated");await review(r.rid);await db.exec('reset role');assert.equal(Number((await state()).loan.amount),100000);const approved=await state()
await db.exec('set role authenticated');await review(r.rid);await db.exec('reset role');assert.deepEqual(await state(),approved,'repeated approval cannot apply twice')
await db.exec("set test.actor='finance'");r=await request(120000);await r.run();await db.exec("set test.actor='owner';update v113072_employee_cash_advances set remaining_amount=remaining_amount-1000 where id='"+loan+"'");const staleBefore=await state();assert.equal((await review(r.rid)).rows[0].r.status,'stale');assert.deepEqual(await state(),staleBefore)
await db.exec("set test.actor='finance'");r=await request(110000);await r.run();await db.exec("set test.actor='owner'");await review(r.rid,false);assert.deepEqual(await state(),staleBefore,'rejection changes no financial record')
await db.exec("set test.actor='finance'");r=await request(130000);await r.run();await db.exec(`insert into v113072_cash_advance_deductions(cash_advance_id,employee_id,payroll_month,amount) values('${loan}','${id}','2026-10-01',1000);insert into v113_payroll_payments values('${id}','2026-10-01',1000);set test.actor='owner'`);const paidState=await state();assert.equal((await review(r.rid)).rows[0].r.status,'stale');assert.deepEqual(await state(),paidState)
await db.exec("set test.actor='finance'");r=await request(140000);await assert.rejects(r.run(),/gaji yang sudah dibayarkan/)
await db.exec("set test.actor='none';set role authenticated");assert.equal((await db.query('select count(*) n from v113161_cash_advance_requests')).rows[0].n,0);await assert.rejects(r.run(),/Akses Keuangan/)
await db.exec('reset role');assert.equal(Number((await db.query('select count(*) n from v113123_cash_advance_corrections')).rows[0].n),1)
console.log('PASS SQL083: actual legacy correction and salary guard; finance proposals and duplicate retries leave balances/cash/payroll unchanged; only owner approves/rejects; approval applies exactly once; changed balances or paid salary invalidate; immutable RLS history and unrelated-user denial.')
await db.close()
