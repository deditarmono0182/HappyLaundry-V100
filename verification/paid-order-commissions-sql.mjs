import {PGlite} from '@electric-sql/pglite'
import {readFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const db=new PGlite(),sql=await readFile('SQL_091_KOMISI_ORDER_LUNAS_MULAI_NOVEMBER.sql','utf8')
await db.exec(`create role anon;create role authenticated;grant usage on schema public to authenticated,anon;
create table v100_orders(id uuid primary key,order_no text,total numeric,paid_amount numeric,status text,created_at timestamptz);
create table v100_payments(id uuid primary key,order_id uuid,amount numeric,created_at timestamptz);
create table v113_order_commissions(order_id uuid);
create table v113097_order_commission_members(order_id uuid);
create table v113_payroll_payments(payroll_month date,amount numeric);
create table v113072_cash_advance_deductions(payroll_month date,amount numeric);
create table test_source(order_id uuid,order_no text,employee_id uuid,commission_type text,base_amount numeric,percent numeric,amount numeric,earned_at timestamptz);
create view v113_commission_ledger with(security_invoker=true) as select * from test_source;
grant select on test_source,v113_commission_ledger,v100_orders to authenticated;
create table v109_users(id uuid primary key,is_active boolean);
create view v100_orders_view as select * from v100_orders;
create table v100_order_items(order_id uuid,service_id uuid,subtotal numeric);
create table v100_services(id uuid,category text);
create table v106_expenses_view(amount numeric,expense_date date,category_name text,group_name text);
create table v111_attendance(employee_id uuid,attendance_date date,status text);
create table v111_employee_payroll_settings(employee_id uuid,attendance_rate numeric,monthly_allowance numeric);
create table v111_payroll_adjustments(employee_id uuid,payroll_month date,bonus numeric);
create table v111_employee_revenue_shares(employee_id uuid,category text,share_percent numeric);
create table v113151_manager_shares(employee_id uuid,payroll_month date,share_percent numeric);

`)
await db.exec(await readFile('SQL_087_SELARASKAN_DASAR_LABA_PENGELOLA.sql','utf8'))
const old080=await readFile('supabase/080_v113_0_151_manager_profit_share.sql','utf8')
await db.exec(old080.slice(old080.indexOf('create or replace function public.v113151_manager_amount'),old080.indexOf('create or replace function public.v113151_manager_report')))
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const add=async(n,date,paid,total=100000,status='received')=>{
 await db.query('insert into v100_orders values($1,$2,$3,$4,$5,$6)',[id(n),`HL-${n}`,total,paid,status,date])
 for(const role of ['production','courier'])await db.query('insert into test_source values($1,$2,$3,$4,$5,20,20000,$6)',[id(n),`HL-${n}`,id(role==='production'?91:92),role,total,date])
}
await add(1,'2026-10-31T23:59:59+07',0)
await add(2,'2026-11-01T00:00:00+07',0)
await add(3,'2026-11-02T12:00:00+07',50000)
await add(4,'2026-11-02T12:00:00+07',100000)
await add(5,'2026-11-02T12:00:00+07',100000,100000,'cancelled')
await add(6,'2026-11-02T12:00:00+07',120000)
await add(7,'2026-11-02T12:00:00+07',0,0)
await db.query('insert into v100_payments values($1,$2,40000,$3),($4,$2,60000,$5)',[id(41),id(4),'2026-11-03T12:00+07',id(42),'2026-11-04T12:00+07'])
await db.query('insert into v100_payments values($1,$2,120000,$3)',[id(61),id(6),'2026-12-01T00:00+07'])
await db.exec(`insert into v109_users values('${id(91)}',true),('${id(92)}',true);
insert into v111_employee_payroll_settings values('${id(91)}',10000,10000);
insert into v106_expenses_view values(10000,'2026-11-02','Operasional','Operasional');
insert into v113151_manager_shares values('${id(91)}','2026-10-01',40),('${id(91)}','2026-11-01',40);`)
const managerBase=async(month)=>(await db.query('select v113151_profit_base($1) b',[month])).rows[0].b
const oldOctoberManager=JSON.stringify(await managerBase('2026-10-01'))
const oldOctoberAmount=(await db.query('select v113151_manager_amount($1,$2) a',[id(91),'2026-10-01'])).rows[0].a
// Abort safely for either existing salary payment or an applied deduction.
for(const table of ['v113_payroll_payments','v113072_cash_advance_deductions']){
 await db.exec(`insert into ${table} values('2026-11-01',1)`)
 await assert.rejects(db.exec(sql),/SQL091 dibatalkan/);await db.exec('rollback')
 assert.equal((await db.query("select to_regclass('v113171_commission_policy') x")).rows[0].x,null)
 await db.exec(`delete from ${table}`)
}
await db.exec("insert into v113_payroll_payments values('2026-10-01',20000);insert into v113072_cash_advance_deductions values('2026-10-01',1000)")
const oldTransactions=JSON.stringify((await db.query('select * from v113_payroll_payments')).rows)
await db.exec(sql)
assert.equal(JSON.stringify(await managerBase('2026-10-01')),oldOctoberManager)
assert.equal((await db.query('select v113151_manager_amount($1,$2) a',[id(91),'2026-10-01'])).rows[0].a,oldOctoberAmount)
const newBase=await managerBase('2026-11-01');assert.equal(newBase.revenue,100000);assert.equal(newBase.employee_cost,50000);assert.equal(newBase.operating,10000);assert.equal(newBase.profit_base,40000);assert.equal(newBase.revenue_basis,'fully_paid_orders')
assert.equal((await db.query('select v113151_manager_amount($1,$2) a',[id(91),'2026-11-01'])).rows[0].a,'16000.00')
assert.equal((await managerBase('2026-12-01')).revenue,100000,'December settlement excludes from November, includes December')
const ledger=async()=> (await db.query('select * from v113_commission_ledger order by order_id,commission_type')).rows
let rows=await ledger();assert.deepEqual(rows.map(x=>x.order_no),['HL-1','HL-1','HL-4','HL-4','HL-6','HL-6'])
assert.equal(rows.find(x=>x.order_no==='HL-4').earned_at.toISOString(),'2026-11-04T05:00:00.000Z')
assert.equal(rows.find(x=>x.order_no==='HL-6').earned_at.toISOString(),'2026-11-30T17:00:00.000Z')
const october=JSON.stringify(rows.filter(x=>x.order_no==='HL-1'))
// Late payment of October's already-counted commission must not produce a November duplicate.
await db.exec(`update v100_orders set paid_amount=100000 where id='${id(1)}'`)
assert.equal(JSON.stringify((await ledger()).filter(x=>x.order_no==='HL-1')),october)
assert.equal(JSON.stringify(await managerBase('2026-10-01')),oldOctoberManager)
assert.equal((await managerBase('2026-11-01')).revenue,100000,'October revenue is not distributed twice after late payment')
// A new full payment recognizes both roles once; DP and stale 'paid' status do not.
await db.exec(`update v100_orders set paid_amount=100000 where id='${id(2)}'`)
assert.equal((await ledger()).filter(x=>x.order_no==='HL-2').length,2)
await db.exec(`update v100_orders set status='ready' where id='${id(2)}'`)
assert.equal((await ledger()).filter(x=>x.order_no==='HL-2').length,2)
assert.equal((await ledger()).filter(x=>x.order_no==='HL-3').length,0)
// Re-run after salary payments: no new initialization, no resnapshot, no date changes.
const stable=JSON.stringify(await ledger());await db.exec("insert into v113_payroll_payments values('2026-11-01',10)");await db.exec(sql)
assert.equal(JSON.stringify(await ledger()),stable)
// Legacy corrections/cancellation/deletion cannot silently change preserved October rows.
await db.exec(`update test_source set amount=99999 where order_id='${id(1)}';update v100_orders set status='cancelled' where id='${id(1)}'`)
assert.equal(JSON.stringify((await ledger()).filter(x=>x.order_no==='HL-1')),october)
// New-period cancellations and unpaid/refunded orders are excluded.
await db.exec(`update v100_orders set paid_amount=99999 where id='${id(2)}'`)
assert.equal((await ledger()).filter(x=>x.order_no==='HL-2').length,0)
assert.equal((await db.query("select * from v113_payroll_payments where payroll_month='2026-10-01'")).rows.length,1)
assert.equal(JSON.stringify((await db.query("select * from v113_payroll_payments where payroll_month='2026-10-01'")).rows),oldTransactions)
// App roles can read through the new ledger but cannot edit frozen history/policy/dates.
await db.exec('set role authenticated');await assert.rejects(managerBase('2026-11-01'),/permission denied/);assert.ok((await ledger()).length>0)
for(const table of ['v113171_legacy_commissions','v113171_commission_policy','v113171_order_settlements'])await assert.rejects(db.exec(`delete from ${table}`),/permission denied/)
await db.exec('reset role;set role anon');await assert.rejects(ledger(),/permission denied/)
await db.close();console.log('PASS SQL091 + manager: October original SQL087 and share unchanged, November/December paid revenue, 40% after expenses/employee costs, old revenue not counted twice, internal functions private; WIB cutoff, October frozen, late settlement no duplicate, unpaid/DP/cancel/zero excluded, full/overpayment and payment-month recognition, both roles, preflight salary/deduction rollback, idempotent after payroll, no salary/cash-advance transaction edits, authenticated read/immutable snapshot/anon denial.')
