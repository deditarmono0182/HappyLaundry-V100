import {PGlite} from '@electric-sql/pglite'
import {readFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const db=new PGlite()
await db.exec(`create role anon;create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create table v100_orders(id int primary key,order_no text,customer_name text,customer_phone text,status text,payment_status text,total numeric,paid_amount numeric,created_at timestamptz,due_at timestamptz,progress_last_at timestamptz,visible boolean default true);
create view v100_orders_view with(security_invoker=true) as select * from v100_orders;
create table v100_order_items(order_id int,service_name text,quantity numeric,unit text);
create table v100_services(name text,category text);
create table v113_order_commissions(order_id int,worker_id int,courier_id int);
alter table v100_orders enable row level security;create policy read_visible on v100_orders for select to authenticated using(visible);
grant usage on schema public,auth to authenticated,anon;grant select on v100_orders_view,v100_orders,v100_order_items,v100_services,v113_order_commissions to authenticated;
insert into v100_orders select i,'HL-'||i,'Pelanggan '||i,'08123','received','unpaid',
case when i<=22 then 50000 when i=23 then 129180 when i>=378 then 105456 else 10000 end,
case when i<=23 or i>=378 then 0 else 10000 end,'2026-10-01T00:00+07'::timestamptz+i*interval '1 hour',null,null,true from generate_series(1,387)i;
insert into v100_orders values(4000,'BATAL','Batal','0','cancelled','unpaid',9999999,0,'2026-10-31T23:59:59.999+07',null,null,true),(4001,'RAHASIA','Tersembunyi','0','received','unpaid',88888888,0,'2026-10-10T12:00+07',null,null,false);
insert into v100_orders select 5000+i,'NOV-'||i,'November '||i,'0','received','unpaid',1,0,'2026-11-01T00:00+07',null,null,true from generate_series(1,1001)i;
`)
const snapshot=JSON.stringify((await db.query('select * from v100_orders order by id')).rows)
const sql=await readFile('SQL_090_TOTAL_ORDER_DAN_PIUTANG_SELURUH_HASIL.sql','utf8');await db.exec(sql);await db.exec(sql)
await db.exec("set role authenticated;set test.uid='00000000-0000-0000-0000-000000000001'")
const page=async(filters={},offset=0,limit=100,q='')=>(await db.query("select * from v113170_search_orders($1,$2,$3,'2026-10-01','2026-10-31',$4)",[q,limit,offset,filters])).rows
const summary=async(filters={},q='')=>(await db.query("select v113170_order_search_summary($1,'2026-10-01','2026-10-31',$2) r",[q,filters])).rows[0].r
const first=await page(),whole=await summary()
assert.equal(first.length,100);assert.equal(first.filter(r=>r.status!=='cancelled').reduce((s,r)=>s+Number(r.total)-Number(r.paid_amount),0),1054560)
assert.equal(whole.count,388);assert.equal(whole.receivable,2283740);assert.equal(whole.unpaid_count,33)
const all=[];for(let offset=0;offset<whole.count;offset+=100)all.push(...await page({},offset))
assert.equal(all.length,whole.count);assert.equal(new Set(all.map(r=>r.id)).size,whole.count);assert.equal(all.filter(r=>r.status!=='cancelled').reduce((s,r)=>s+Math.max(0,Number(r.total)-Number(r.paid_amount)),0),whole.receivable)
assert.equal((await summary({payment:'unpaid'})).count,33);assert.equal((await summary({payment:'paid'})).count,354);assert.equal((await summary({payment:'paid'})).receivable,0)
assert.equal((await page({},0,99999)).length,200)
assert.equal((await summary({},"%_' OR true --")).count,0)
assert.equal((await summary({},'RAHASIA')).count,0)
assert.equal((await summary({status:'cancelled'})).receivable,0)
await db.exec('reset role');assert.equal(JSON.stringify((await db.query('select * from v100_orders order by id')).rows),snapshot,'migration and reads do not modify orders')
await db.exec(`update v100_orders set due_at=now()-interval '1 hour' where id=1;update v100_orders set status='ready',progress_last_at=now()-interval '25 hours' where id=2;
insert into v100_order_items values(1,'Karpet',1,'pcs'),(1,'Karpet',2,'pcs');insert into v100_services values('Karpet','Express');insert into v113_order_commissions values(1,1,null),(2,null,2),(3,1,2);set role authenticated;`)
assert.equal((await summary({status:'overdue'})).count,1);assert.equal((await summary({category:'Express'})).receivable,50000,'EXISTS avoids double counting item/category rows')
assert.equal((await summary({assignment:'missing_courier',category:'Express'})).count,1);assert.equal((await summary({assignment:'missing_worker',category:'Express'})).count,0)
assert.equal((await summary({attention:'ready_long'})).count,1);assert.equal((await page({attention:'ready_long'}))[0].id,2)
assert.ok((await summary({attention:'no_due'})).count>300)
await db.exec("set test.uid=''");assert.equal((await summary()).count,0);await db.exec('reset role;set role anon');await assert.rejects(summary(),/permission denied/)
await db.close();console.log('PASS SQL090: exact screenshot case 100 rows Rp1054560 versus full October Rp2283740/33 unpaid; 1388+ orders, no API cap, same summary/page filters, cancellation/overpayment rules, normalized payment labels, item deduplication, assignment/attention/date/WIB/RLS, no transaction writes, idempotent migration.')
