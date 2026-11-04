import {PGlite} from '@electric-sql/pglite'
import {readFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const db=new PGlite(),id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
await db.exec(`create role anon;create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create table v109_users(id uuid primary key,auth_uid uuid,is_active boolean,finance boolean);
create function v109_is_owner() returns boolean language sql as $$select current_setting('test.owner',true)='yes'$$;
create function v113122_can_manage_cash_advance() returns boolean language sql as $$select v109_is_owner() or exists(select 1 from v109_users where auth_uid=auth.uid() and is_active and finance)$$;
create table v113161_cash_advance_requests(id uuid primary key,employee_name text,new_amount numeric,requested_by uuid,requester_name text,requested_at timestamptz default now(),status text default 'pending',reviewed_at timestamptz,review_note text);
create table v113163_cash_advance_addition_requests(id uuid primary key,employee_name text,amount numeric,requested_by uuid,requester_name text,requested_at timestamptz default now(),status text default 'pending',reviewed_at timestamptz,review_note text);
insert into v109_users values('${id(1)}','${id(11)}',true,true),('${id(2)}','${id(12)}',true,true),('${id(3)}','${id(13)}',true,false);
insert into v113163_cash_advance_addition_requests(id,employee_name,amount,requested_by,requester_name) values('${id(101)}','CECE',100000,'${id(11)}','Admin 1');
set test.owner='yes';set test.uid='${id(90)}';`)
const sql=await readFile('SQL_089_NOTIFIKASI_PENGAJUAN_KASBON.sql','utf8');await db.exec(sql);await db.exec(sql)
assert.equal((await db.query('select requester_employee_id from v113163_cash_advance_addition_requests')).rows[0].requester_employee_id,id(1))
await db.exec(`insert into v113163_cash_advance_addition_requests(id,employee_name,amount,requested_by,requester_name,requester_employee_id) values('${id(102)}','SANTOS',200000,'${id(11)}','Admin 1','${id(2)}');insert into v113161_cash_advance_requests(id,employee_name,new_amount,requested_by,requester_name) values('${id(201)}','CECE',300000,'${id(12)}','Admin 2');`)
assert.equal((await db.query("select requester_employee_id from v113163_cash_advance_addition_requests where id=$1",[id(102)])).rows[0].requester_employee_id,id(1),'trigger prevents spoofed recipient metadata')
const actor=async(uid,owner=false)=>db.exec(`set test.uid='${uid}';set test.owner='${owner?'yes':'no'}'`)
const notices=async()=>(await db.query('select v113169_cash_advance_notices() r')).rows[0].r
assert.equal((await notices()).count,3)
await actor(id(11));assert.equal((await notices()).count,0)
await db.exec(`update v113163_cash_advance_addition_requests set status='approved',reviewed_at=now(),review_note='Dana disetujui' where id='${id(101)}';update v113161_cash_advance_requests set status='rejected',reviewed_at=now(),review_note='Tidak sesuai bukti' where id='${id(201)}';`)
await db.exec('set role authenticated');const first=await notices();assert.equal(first.count,1);assert.equal(first.rows[0].status,'approved')
const other='correction:'+id(201)+':rejected';await db.query('select v113169_read_cash_advance_notice($1)',[other]);assert.equal((await notices()).count,1)
await db.query('select v113169_read_cash_advance_notice($1)',[first.rows[0].key]);await db.query('select v113169_read_cash_advance_notice($1)',[first.rows[0].key]);assert.equal((await notices()).count,0)
await assert.rejects(db.query('select * from v113169_cash_advance_notice_reads'),/permission denied/)
await db.exec(`reset role;update v109_users set auth_uid='${id(14)}' where id='${id(1)}';update v113163_cash_advance_addition_requests set status='rejected',reviewed_at=now() where id='${id(102)}';set role authenticated;`)
await actor(id(14));const rotated=await notices();assert.equal(rotated.count,1);assert.equal(rotated.rows[0].request_id,id(102),'stable requester employee identity survives new auth session');assert.ok(!rotated.rows.some(r=>r.request_id===id(101)),'read marker persists across auth rotation')
await actor(id(12));assert.equal((await notices()).rows[0].kind,'correction');assert.equal((await notices()).rows[0].status,'rejected')
await actor(id(90),true);assert.equal((await notices()).count,0)
await actor(id(13));await assert.rejects(notices(),/Akses Keuangan/)
await db.exec("set test.uid='';set test.owner='no'");await assert.rejects(notices(),/Akses Keuangan/)
await db.exec('reset role;set role anon');await assert.rejects(notices(),/permission denied/)
await db.exec('reset role');assert.equal((await db.query('select sum(amount) n from v113163_cash_advance_addition_requests')).rows[0].n,'300000');assert.equal((await db.query('select new_amount from v113161_cash_advance_requests')).rows[0].new_amount,'300000')
await db.close();console.log('PASS SQL089: Owner pending both types, requester-only approved/rejected notifications, no other-staff leakage, durable read receipts/idempotent ack, auth rotation and recipient spoof protection, permission checks, migration rerun; request amounts unchanged.')
