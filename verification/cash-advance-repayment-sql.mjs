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

await db.exec(`create table v100_cash_transactions(id uuid primary key default gen_random_uuid(),kind text check(kind in ('income','expense')),category text,description text,amount numeric check(amount>0),method text,created_by uuid,created_at timestamptz default now())`)
await db.exec(`alter function v109_current_employee() security definer`)
const paymentMigration=await readFile('supabase/082_v113_0_153_cash_advance_repayments.sql','utf8');await db.exec(paymentMigration)
await correct(2062200,300000)
const pid=n=>`20000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const pay=(id,value,method='cash',ref=null,employee=a)=>db.query('select v113153_receive_cash_advance_repayment($1,$2,$3,$4,$5,$6) r',[id,employee,value,method,ref,'Pembayaran utang kasbon'])
const cancel=(id,reason='Salah catat pembayaran')=>db.query('select v113153_cancel_cash_advance_repayment($1,$2) r',[id,reason])
const capture=async()=>({loans:(await db.query('select * from v113072_employee_cash_advances order by id')).rows,deductions:(await db.query('select * from v113072_cash_advance_deductions order by id')).rows,payments:(await db.query('select * from v113153_cash_advance_repayments order by id')).rows,cash:(await db.query('select * from v100_cash_transactions order by id')).rows,allocations:(await db.query('select * from v113153_cash_advance_repayment_allocations order by repayment_id,cash_advance_id')).rows})
const baseBefore=(await db.query(`select v113151_profit_base('2026-10-01') r`)).rows[0].r
const grossBefore=(await db.query(`select v113152_salary_capacity($1,'2026-10-01') r`,[a])).rows[0].r.gross
await pay(pid(1),100000);assert.equal(await sum('v113072_employee_cash_advances','remaining_amount'),4400000)
await pay(pid(2),250000,'transfer','BANK-001');assert.equal(await sum('v113072_employee_cash_advances','remaining_amount'),4150000)
assert.equal(await sum('v113072_cash_advance_deductions','amount',a,'2026-10-01'),300000,'cash repayments never create salary deductions')
assert.equal((await db.query(`select v113152_salary_capacity($1,'2026-10-01') r`,[a])).rows[0].r.gross,grossBefore)
assert.deepEqual((await db.query(`select v113151_profit_base('2026-10-01') r`)).rows[0].r,baseBefore,'no extra revenue or profit')
assert.equal(Number((await db.query(`select sum(amount) n from v100_cash_transactions where kind='income'`)).rows[0].n),350000)
assert.equal((await db.query(`select method from v100_cash_transactions where method='transfer'`)).rows.length,1)
let before=await capture();await pay(pid(1),100000);assert.deepEqual(await capture(),before,'same request id cannot receive twice')
await assert.rejects(pay(pid(1),99999),/data lain/)
for(const args of [[pid(3),0],[pid(3),-1],[pid(3),'NaN'],[pid(3),10,'qris'],[pid(3),10,'transfer',null],[pid(3),99999999]])await assert.rejects(pay(...args))
assert.deepEqual(await capture(),before)
const cashId=(await db.query('select cash_transaction_id from v113153_cash_advance_repayments where id=$1',[pid(1)])).rows[0].cash_transaction_id
await assert.rejects(db.query(`update v100_cash_transactions set amount=1 where id=$1`,[cashId]),/pembayaran kasbon/)
await assert.rejects(db.query(`delete from v100_cash_transactions where id=$1`,[cashId]),/pembayaran kasbon/)
await assert.rejects(db.query(`update v113072_employee_cash_advances set cancelled_at=now() where id=$1`,[l1]),/Batalkan pembayaran/)
await cancel(pid(2));assert.equal(await sum('v113072_employee_cash_advances','remaining_amount'),4400000)
assert.equal(Number((await db.query(`select sum(case when kind='income' then amount else -amount end) n from v100_cash_transactions`)).rows[0].n),100000,'cash reversal offsets cancelled receipt')
before=await capture();await cancel(pid(2));assert.deepEqual(await capture(),before,'duplicate cancel cannot restore debt or refund twice')
await pay(pid(3),2000000);assert.equal((await db.query('select * from v113153_cash_advance_repayment_allocations where repayment_id=$1',[pid(3)])).rows.length,2,'FIFO allocates across loans')
await db.exec(`insert into v113_payroll_payments values('${a}','2026-10-01',1000)`)
await pay(pid(4),10000,'transfer','BANK-002');assert.equal(await sum('v113072_cash_advance_deductions','amount',a,'2026-10-01'),300000,'cash repayment allowed even after salary paid')
await pay(pid(6),10000,'cash',null,b)
// Permission checks: employee reads own receipts, cannot read another employee or write.
await db.exec(`set test.owner='false'`);await assert.rejects(pay(pid(5),10),/Hanya Owner/);await assert.rejects(cancel(pid(1)),/Hanya Owner/)
await db.exec('set role authenticated')
assert.equal((await db.query('select * from v113153_cash_advance_repayments')).rows.length,4)
await assert.rejects(db.query('delete from v113153_cash_advance_repayments'),/permission denied/)
await db.exec(`reset role;set test.owner='true'`)
// The migration creates no new repayment on re-run.
before=await capture();await db.exec(paymentMigration);assert.deepEqual(await capture(),before)
assert.equal(await sum('v113072_employee_cash_advances','amount'),4800000,'principal unchanged')
await db.close()
console.log('PASS V153 repayment SQL: cash/transfer FIFO, real cash receipt and reversal, salary deductions/gross/profit unchanged, idempotent retry/cancel, invalid/overpayment rejected atomically, paid salary independent, linked ledger/loan guard, owner-only writes and own-read RLS, migration rerunnable.')
