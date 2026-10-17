import {PGlite} from '@electric-sql/pglite'
import {readFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const db=new PGlite(),u1='00000000-0000-0000-0000-000000000001',u2='00000000-0000-0000-0000-000000000002'
const oid=n=>`00000000-0000-0000-0000-${String(100+n).padStart(12,'0')}`
await db.exec(`create role anon;create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql as $$select '${u1}'::uuid$$;
create function public.v109_is_owner() returns boolean language sql as $$select true$$;
create table public.v109_users(id uuid primary key,full_name text,login_id text,is_active boolean);
create function v109_current_employee() returns setof v109_users language sql as $$select * from v109_users where id='${u1}'$$;
create table public.v100_orders(id uuid primary key,order_no text,total numeric,created_at timestamptz,status text,payment_status text);
create table public.v112_delivery_proofs(order_id uuid);
insert into v109_users values('${u1}','Kurir A','A',true),('${u2}','Kurir B','B',true);`)
for(const file of ['049_v113_0_41_order_employee_courier_commission.sql','050_v113_0_42_courier_commission_completed_fix.sql','063_v113_0_97_team_commission_split.sql'])await db.exec(await readFile('supabase/'+file,'utf8'))
await db.exec(`insert into v113_employee_commission_settings(employee_id,production_percent,courier_percent) values('${u1}',4,6),('${u2}',4,6);`)
for(let n=1;n<=8;n++)await db.query(`insert into v100_orders values($1,$2,100000,$3,$4,$5)`,[oid(n),'HL-'+n,n===7?'2026-09-10T05:00:00+07:00':'2026-10-02T05:00:00+07:00',n===5?'cancelled':n===1?'completed':'received',[1,3].includes(n)?'paid':'unpaid'])
// 1 posted two-person team; 2 pending unpaid; 3 pending without proof; 4 legacy pending;
// 5 cancelled; 6 no assignment; 7 older than cutoff; 8 zero rate, not replaced by latest rate.
await db.exec(`insert into v113_order_commissions(order_id,worker_id,courier_id) values('${oid(1)}','${u1}','${u1}');insert into v112_delivery_proofs values('${oid(1)}');`)
await db.query(`select v113097_set_order_commission_team($1,$2,$3)`,[oid(1),[u1],[u1,u2]])
for(const n of [2,3,5,7])await db.query(`select v113097_set_order_commission_team($1,'{}'::uuid[],$2)`,[oid(n),[u1]])
await db.query(`insert into v113_order_commissions(order_id,courier_id) values($1,$2)`,[oid(4),u1])
await db.exec(`update v113_employee_commission_settings set courier_percent=0 where employee_id='${u1}'`)
await db.query(`select v113097_set_order_commission_team($1,'{}'::uuid[],$2)`,[oid(8),[u1]])
await db.exec(`update v113_employee_commission_settings set courier_percent=20 where employee_id='${u1}'`)
const postedBefore=(await db.query(`select employee_id,amount,total_percent,earned_at from v113097_order_commission_members where order_id=$1 and commission_type='courier' order by employee_id`,[oid(1)])).rows
const productionBefore=(await db.query(`select worker_id,worker_amount,worker_percent,worker_earned_at from v113_order_commissions where order_id=$1`,[oid(1)])).rows
const pendingBefore=(await db.query(`select order_id,amount,total_percent from v113097_order_commission_members where earned_at is null order by order_id`)).rows
const migration=await readFile('supabase/077_v113_0_142_courier_commission_on_order_entry.sql','utf8')
await db.exec(migration)
const ledger=async(n)=>(await db.query(`select * from v113_commission_ledger where order_id=$1 and commission_type='courier'`,[oid(n)])).rows
assert.equal((await ledger(1)).length,2,'team rights not duplicated by legacy fallback')
for(const n of [2,3,4,8]){assert.equal((await ledger(n)).length,1);assert.equal(new Date((await ledger(n))[0].earned_at).toISOString(),'2026-10-01T22:00:00.000Z')}
assert.equal((await ledger(5)).length,0);assert.equal((await ledger(6)).length,0);assert.equal((await ledger(7)).length,0)
assert.equal(Number((await ledger(2))[0].amount),6000);assert.equal(Number((await ledger(8))[0].amount),0,'zero historical rate is not guessed')
assert.deepEqual((await db.query(`select employee_id,amount,total_percent,earned_at from v113097_order_commission_members where order_id=$1 and commission_type='courier' order by employee_id`,[oid(1)])).rows,postedBefore)
assert.deepEqual((await db.query(`select worker_id,worker_amount,worker_percent,worker_earned_at from v113_order_commissions where order_id=$1`,[oid(1)])).rows,productionBefore)
assert.deepEqual((await db.query(`select order_id,amount,total_percent from v113097_order_commission_members where order_id=any($1::uuid[]) order by order_id`,[pendingBefore.map(r=>r.order_id)])).rows,pendingBefore)
const audits=(await db.query('select * from v113142_courier_recognition_audit')).rows
assert.equal(audits.length,4)
await db.exec(migration);assert.equal((await db.query('select count(*)::int n from v113142_courier_recognition_audit')).rows[0].n,4)
// Future unpaid order: recognized immediately, production remains pending.
await db.query(`insert into v100_orders values($1,'NEW',100000,'2026-10-03T05:00:00+07:00','received','unpaid')`,[oid(9)])
await db.query(`insert into v113_order_commissions(order_id,worker_id,courier_id) values($1,$2,$2)`,[oid(9),u1])
assert.equal(Number((await ledger(9))[0].amount),20000)
assert.equal((await db.query('select worker_earned_at from v113_order_commissions where order_id=$1',[oid(9)])).rows[0].worker_earned_at,null)
await db.query(`select v113097_set_order_commission_team($1,$2,$3)`,[oid(9),[u1],[u1,u2]])
assert.equal((await ledger(9)).length,2)
const total=(await ledger(9)).reduce((s,r)=>s+Number(r.amount),0);assert.equal(total,20000)
// Same team is re-saved after a rate change: preserve snapshot and posting date.
await db.exec(`update v113_employee_commission_settings set courier_percent=30`)
const beforeResave=await ledger(1)
await db.query(`select v113097_set_order_commission_team($1,$2,$3)`,[oid(1),[u1],[u1,u2]])
assert.deepEqual((await ledger(1)).map(r=>[r.employee_id,r.amount,r.earned_at]).sort(),beforeResave.map(r=>[r.employee_id,r.amount,r.earned_at]).sort())
await db.query(`update v100_orders set payment_status='paid' where id=$1`,[oid(9)])
await db.query(`insert into v112_delivery_proofs values($1)`,[oid(9)])
assert.equal((await ledger(9)).reduce((s,r)=>s+Number(r.amount),0),20000,'later payment does not use latest 30%')
await db.query(`update v100_orders set status='cancelled' where id=$1`,[oid(9)])
assert.equal((await ledger(9)).length,0,'cancelled order excluded')
const my=(await db.query(`select * from v113072_my_commissions('2026-10-01')`)).rows
assert.ok(my.some(r=>r.order_id===oid(2)),'5 AM WIB order included in October payroll')
console.log('PASS: real old triggers and migration; pending unpaid/no-proof backfill; stored rates/amounts; posted commissions/production retained; zero rates; no duplicate legacy/team; idempotent migration; new unpaid order; same-team re-save; subsequent payment/proof; cancellation; WIB payroll boundary.')


// V143 production regression using the actual SQL 077 state and triggers above.
await db.exec(`update v113_employee_commission_settings set production_percent=20`)
for(let n=20;n<=28;n++)await db.query(`insert into v100_orders values($1,$2,64000,$3,$4,$5)`,[oid(n),'PROD-'+n,n===26?'2026-09-30T23:59:59+07:00':'2026-10-06T05:00:00+07:00',n===23?'cancelled':n===24?'completed':'received',n===24?'paid':'unpaid'])
for(const n of [20,21,23,24,26])await db.query(`select v113097_set_order_commission_team($1,$2,'{}'::uuid[])`,[oid(n),n===21?[u1,u2]:[u1]])
for(const n of [21,22])await db.query(`insert into v113_order_commissions(order_id,worker_id) values($1,$2)`,[oid(n),u1])
await db.exec(`update v113_employee_commission_settings set production_percent=0 where employee_id='${u1}'`)
await db.query(`select v113097_set_order_commission_team($1,$2,'{}'::uuid[])`,[oid(25),[u1]])
await db.exec(`update v113_employee_commission_settings set production_percent=30`)
// Emulate Haris's targeted 20% team correction from the live session.
await db.query(`update v113097_order_commission_members set total_percent=20,amount=base_amount*0.2 where order_id=$1 and commission_type='courier'`,[oid(8)])
const snapshot=async(sql)=>(await db.query(sql)).rows
const courierSnapshot=await snapshot(`select * from v113097_order_commission_members where commission_type='courier' order by order_id,employee_id`)
const legacySnapshot=await snapshot(`select order_id,worker_percent,worker_amount,courier_percent,courier_amount,courier_earned_at from v113_order_commissions order by order_id`)
const postedProduction=await snapshot(`select order_id,employee_id,earned_at,amount,total_percent from v113097_order_commission_members where commission_type='production' and earned_at is not null order by order_id,employee_id`)
const productionAmounts=await snapshot(`select order_id,employee_id,amount,total_percent,share_percent from v113097_order_commission_members where commission_type='production' order by order_id,employee_id`)
const sql143=await readFile('supabase/078_v113_0_143_production_commission_on_order_entry.sql','utf8')
await db.exec(sql143)
const prod=async(n)=>(await db.query(`select * from v113_commission_ledger where order_id=$1 and commission_type='production' order by employee_id`,[oid(n)])).rows
assert.equal((await prod(20)).length,1);assert.equal(Number((await prod(20))[0].amount),12800)
assert.equal((await prod(21)).length,2,'team shadows legacy: exactly two rights')
assert.equal((await prod(21)).reduce((s,r)=>s+Number(r.amount),0),12800)
assert.equal((await prod(22)).length,1,'pending legacy recognized')
assert.equal((await prod(23)).length,0,'cancelled excluded')
assert.equal((await prod(25)).length,1);assert.equal(Number((await prod(25))[0].amount),0,'old zero rate stays zero')
assert.equal((await prod(26)).length,0,'pre-October pending excluded from backfill')
assert.equal((await prod(27)).length,0,'no assignment not guessed')
assert.equal(new Date((await prod(20))[0].earned_at).toISOString(),'2026-10-05T22:00:00.000Z')
assert.deepEqual(await snapshot(`select * from v113097_order_commission_members where commission_type='courier' order by order_id,employee_id`),courierSnapshot,'courier including Haris correction unchanged')
assert.deepEqual(await snapshot(`select order_id,worker_percent,worker_amount,courier_percent,courier_amount,courier_earned_at from v113_order_commissions order by order_id`),legacySnapshot,'legacy snapshot amounts retained')
assert.deepEqual(await snapshot(`select order_id,employee_id,amount,total_percent,share_percent from v113097_order_commission_members where commission_type='production' order by order_id,employee_id`),productionAmounts,'all stored production tariffs/amounts retained')
for(const old of postedProduction){const r=(await prod(Number(old.order_id.slice(-12))-100)).find(r=>r.employee_id===old.employee_id);assert.equal(new Date(r.earned_at).toISOString(),new Date(old.earned_at).toISOString())}
const auditCount=(await db.query(`select count(*)::int n from v113143_production_recognition_audit`)).rows[0].n
assert.ok(auditCount>=5)
const afterFirst=await snapshot(`select * from v113_commission_ledger order by order_id,commission_type,employee_id`)
await db.exec(sql143)
assert.deepEqual(await snapshot(`select * from v113_commission_ledger order by order_id,commission_type,employee_id`),afterFirst,'rerun does not duplicate or alter ledger')
assert.equal((await db.query(`select count(*)::int n from v113143_production_recognition_audit`)).rows[0].n,auditCount)
// New assignment on unpaid/unfinished order is immediately recognized.
await db.query(`insert into v113_order_commissions(order_id,worker_id,courier_id) values($1,$2,$2)`,[oid(28),u1])
assert.equal((await prod(28)).length,1);assert.equal(Number((await prod(28))[0].amount),19200)
await db.query(`select v113097_set_order_commission_team($1,$2,$3)`,[oid(28),[u1,u2],[u1]])
assert.equal((await prod(28)).length,2);assert.equal((await prod(28)).reduce((s,r)=>s+Number(r.amount),0),19200)
// Same team saved after a rate change retains historical tariffs and posting dates.
await db.exec(`update v113_employee_commission_settings set production_percent=40`)
const beforeSave=await prod(21)
await db.query(`select v113097_set_order_commission_team($1,$2,'{}'::uuid[])`,[oid(21),[u2,u1,u1]])
assert.deepEqual(await prod(21),beforeSave)
await db.query(`update v100_orders set status='completed',payment_status='paid' where id=$1`,[oid(20)])
assert.equal(Number((await prod(20))[0].amount),12800,'payment/completion keeps stored tariff')
assert.equal(new Date((await prod(20))[0].earned_at).toISOString(),'2026-10-05T22:00:00.000Z')
await db.query(`update v100_orders set status='cancelled' where id=$1`,[oid(28)])
assert.equal((await prod(28)).length,0)
await db.query(`update v100_orders set status='received' where id=$1`,[oid(28)])
assert.equal((await prod(28)).length,2,'reopened assigned order recognized once')
const my143=(await db.query(`select * from v113072_my_commissions('2026-10-01')`)).rows
assert.ok(my143.some(r=>r.order_id===oid(20)&&r.commission_type==='production'),'WIB personal payroll includes production')
console.log('PASS V143: production unpaid/unfinished recognition; October pending backfill; legacy+team deduplication; stored snapshots/posted dates/zero rates/courier correction preserved; same-team resave; subsequent payment; cancellation/reopening; repeat migration; personal WIB ledger.')
await db.close()
