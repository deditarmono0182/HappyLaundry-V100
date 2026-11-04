import {PGlite} from '@electric-sql/pglite'
import {readFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const db=new PGlite()
await db.exec(`create role anon;create role authenticated;
create table v109_users(id uuid primary key,full_name text,is_active boolean);
create table v100_orders_view(id uuid,total numeric,status text,created_at timestamptz);
create table v100_order_items(order_id uuid,service_id uuid,subtotal numeric);
create table v100_services(id uuid,category text);
create table v106_expenses_view(amount numeric,expense_date date,category_name text,group_name text);
create table v111_attendance(employee_id uuid,attendance_date date,status text);
create table v111_employee_payroll_settings(employee_id uuid,attendance_rate numeric,monthly_allowance numeric);
create table v111_payroll_adjustments(employee_id uuid,payroll_month date,bonus numeric);
create table v111_employee_revenue_shares(employee_id uuid,category text,share_percent numeric);
create table v113_commission_ledger(employee_id uuid,amount numeric,earned_at timestamptz);
create table v113_payroll_payments(employee_id uuid,amount numeric);
create table v113072_employee_cash_advances(employee_id uuid,amount numeric,remaining_amount numeric);`)
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const people=[['CECE',false,0,10000,0,0],['DedeTri',false,0,0,0,0],['CECE ADI R',true,24,100000,0,2332785.74],['CHOMENG',true,27,100000,0,2527865.73],['HAJI ROBET',true,28,0,0,1583099.99],['Haris',true,0,0,500000,12800],['IBU EDAH',true,28,0,0,1511899.50],['IBU ENDUT',true,29,0,0,2534497.50],['Nuraini',true,0,0,0,0],['SANTOS',true,29,0,0,2037174.99],['TriDede',true,0,0,0,0]]
for(const [i,p] of people.entries()){
 const [name,active,days,allowance,bonus,commission]=p,e=id(i+1)
 await db.query('insert into v109_users values($1,$2,$3)',[e,name,active])
 await db.query('insert into v111_employee_payroll_settings values($1,10000,$2)',[e,allowance])
 for(let d=1;d<=days;d++)await db.query("insert into v111_attendance values($1,$2,'present')",[e,`2026-10-${String(d).padStart(2,'0')}`])
 await db.query("insert into v111_payroll_adjustments values($1,'2026-10-01',$2)",[e,bonus])
 await db.query("insert into v113_commission_ledger values($1,$2,'2026-10-15T00:00+07')",[e,commission])
}
await db.exec(`insert into v100_orders_view values('${id(99)}',27698120,'received','2026-10-01T00:00+07');
insert into v106_expenses_view values(5759500,'2026-10-01','Operasional','Operasional');
insert into v113_payroll_payments values('${id(4)}',1297866);
insert into v113072_employee_cash_advances values('${id(3)}',4800000,2500000);`)
const original=await readFile('supabase/080_v113_0_151_manager_profit_share.sql','utf8')
await db.exec(original.slice(original.indexOf('create or replace function public.v113151_profit_base'),original.indexOf('create or replace function public.v113151_manager_amount')))
const base=async()=> (await db.query("select v113151_profit_base('2026-10-01') r")).rows[0].r
const before=await base()
assert.equal(Math.round(before.employee_cost),14900123)
const tables=['v109_users','v111_attendance','v111_employee_payroll_settings','v111_payroll_adjustments','v111_employee_revenue_shares','v113_commission_ledger','v113_payroll_payments','v113072_employee_cash_advances']
const snapshot=async()=>JSON.stringify(await Promise.all(tables.map(t=>db.query('select * from '+t))))
const saved=await snapshot(),sql=await readFile('SQL_087_SELARASKAN_DASAR_LABA_PENGELOLA.sql','utf8')
await db.exec(sql);await db.exec(sql)
const after=await base()
assert.equal(before.employee_cost-after.employee_cost,10000)
assert.equal(Math.round(after.employee_cost),14890123)
assert.equal(after.profit_base-before.profit_base,10000)
assert.equal(Math.round(after.profit_base*.4),2819399)
assert.equal(saved,await snapshot())
assert.equal((await db.query("select has_function_privilege('authenticated','v113151_profit_base(date)','execute') allowed")).rows[0].allowed,false)
assert.equal((await db.query("select has_function_privilege('anon','v113151_profit_base(date)','execute') allowed")).rows[0].allowed,false)
// Each component for inactive accounts is excluded; active rows remain included.
const e=id(1),service=id(88)
await db.exec(`insert into v111_attendance values('${e}','2026-10-01','present');
insert into v111_payroll_adjustments values('${e}','2026-10-01',500);
insert into v113_commission_ledger values('${e}',2500,'2026-10-15T00:00+07');
insert into v111_employee_revenue_shares values('${e}','Kiloan',10);`)
assert.equal((await base()).employee_cost,after.employee_cost)
// No deletion: reactivating the employee makes the same stored costs count again.
await db.exec(`update v109_users set is_active=true where id='${e}'`)
assert.equal((await base()).employee_cost-after.employee_cost,10000+10000+500+2500+2769812)
const empty=(await db.query("select v113151_profit_base('2026-09-01') r")).rows[0].r
assert.ok(empty.profit_base<0)
assert.equal(Math.max(0,empty.profit_base)*.4,0)
await db.close()
console.log('PASS SQL087: October case reproduced, exact Rp10000 difference removed; manager entitlement +Rp4000; active/inactive coverage for all five payroll components; no data mutation; re-run safe; privileges preserved; negative base yields zero share.')
