import {PGlite} from '@electric-sql/pglite'
import {readFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const db=new PGlite()
await db.exec(`create role anon;create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table v100_orders(id int primary key,order_no text,customer_name text,customer_phone text,status text,payment_status text,created_at timestamptz,visible boolean default true);
create table v100_order_items(order_id int,service_name text,quantity numeric,unit text);
create table v100_services(name text,category text);
alter table v100_orders enable row level security;
create policy read_visible on v100_orders for select to authenticated using(visible);
create view v100_orders_view with(security_invoker=true) as select id,order_no,customer_name,customer_phone,status,payment_status,created_at from v100_orders;
grant usage on schema public,auth to authenticated,anon;
grant select on v100_orders_view,v100_orders,v100_order_items,v100_services to authenticated;
insert into v100_orders select n,'HL-'||n,'Pelanggan '||n,'08123'||n,'received','unpaid','2026-10-01'::timestamptz+n*interval '1 minute',true from generate_series(1,1300) n;
update v100_orders set order_no='HL-261006-00141',customer_name='Mamah Alghi',customer_phone='08599999999',status='completed' where id=1;
insert into v100_order_items values(1,'Karpet Permadani',5.35,'item');
insert into v100_services values('Karpet Permadani','Express');
insert into v100_orders values(1301,'RAHASIA','Tidak Boleh Terlihat','0','received','unpaid',now(),false);
`)
const sql=await readFile('supabase/079_v113_0_144_global_order_search.sql','utf8');await db.exec(sql);await db.exec(sql)
await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false)`)
const search=async(q,limit=101,offset=0)=>(await db.query(`select * from v113144_search_orders($1,$2,$3)`,[q,limit,offset])).rows
assert.equal((await search(''))[0].id,1300)
for(const q of ['00141','MAMAH ALGHI','Karpet','Express','5.35','08599999999','selesai'])assert.ok((await search(q)).some(r=>r.id===1),q)
assert.equal((await search('rahasia')).length,0,'RLS hidden row excluded')
assert.equal((await search("%_' OR true --")).length,0,'keyword interpreted literally')
assert.equal((await search('tidak-ada')).length,0)
const all=[];for(let offset=0;offset<1300;offset+=100)all.push(...await search('',100,offset))
assert.equal(all.length,1300);assert.equal(new Set(all.map(r=>r.id)).size,1300)
assert.equal(all.at(-1).id,1,'oldest order reachable beyond first 1000')
assert.equal((await search('',999999)).length,200,'bounded page')
await db.exec(`select set_config('request.jwt.claim.sub','',false)`);assert.equal((await search('')).length,0,'invalid session returns no rows')
await db.exec('reset role;set role anon')
await assert.rejects(search('00141'),/permission denied/,'anonymous cannot execute')
await db.exec('reset role;set role authenticated');await db.exec(`select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false)`)
const dated=async(start,end)=>(await db.query(`select * from v113144_search_orders('',200,0,$1,$2)`,[start,end])).rows
await db.exec('reset role')
await db.exec(`insert into v100_orders values(2001,'WIB-START','Batas awal','0','received','paid','2026-10-05T17:00:00Z',true),(2002,'WIB-END','Batas akhir','0','received','paid','2026-10-06T16:59:59Z',true),(2003,'WIB-NEXT','Hari berikut','0','received','paid','2026-10-06T17:00:00Z',true);set role authenticated`)
assert.deepEqual((await dated('2026-10-06','2026-10-06')).map(r=>r.id),[2002,2001],'both WIB day boundaries inclusive; next day excluded')
assert.equal((await dated('2026-10-07',null))[0].id,2003)
console.log('PASS SQL079: 1300 orders; old note/customer/service/category/phone/status search; literal keywords; deterministic pagination; row-level permissions; invalid and anonymous sessions; rerun without data changes.')
await db.close()
