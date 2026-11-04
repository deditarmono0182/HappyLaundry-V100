import {PGlite} from '@electric-sql/pglite'
import {readFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const db=new PGlite(),id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
await db.exec(`create role anon;create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql as $$select case when current_setting('test.actor',true)='anon' then null else '${id(99)}'::uuid end$$;
create function v113122_can_manage_cash_advance() returns boolean language sql as $$select current_setting('test.actor',true) in('owner','finance')$$;
set test.actor='owner';
create table v100_customers(id uuid primary key,name text,phone text);
insert into v100_customers values('${id(99)}','Pelanggan','08123');
create table v100_orders(id uuid primary key,order_no text,customer_id uuid,status text,total numeric,paid_amount numeric,created_at timestamptz);
create table v100_payments(id uuid primary key,order_id uuid,amount numeric,created_at timestamptz);
create table v113035_audit_log(id bigint generated always as identity primary key,table_name text,record_id text,action text,old_data jsonb,new_data jsonb,created_at timestamptz default '2026-11-02T12:00+07');
create function audit_fixture() returns trigger language plpgsql as $$begin insert into v113035_audit_log(table_name,record_id,action,old_data,new_data) values(tg_table_name,coalesce((case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id',''),tg_op,case when tg_op in('UPDATE','DELETE') then to_jsonb(old) end,case when tg_op in('INSERT','UPDATE') then to_jsonb(new) end);return case when tg_op='DELETE' then old else new end;end;$$;`)
async function order(n,total,date='2026-10-20T12:00+07',status='received'){
 await db.query('insert into v100_orders values($1,$2,$3,$4,$5,0,$6)',[id(n),'HL-'+n,id(99),status,total,date])
}
async function pay(n,o,amount,date){await db.query('insert into v100_payments values($1,$2,$3,$4)',[id(n),id(o),amount,date])}
for(const [n,total] of [[1,100],[2,200],[3,300],[4,400],[5,500],[6,500],[7,600],[8,600],[9,50],[10,80],[11,100],[12,100],[13,0]])await order(n,total,n===5?'2026-11-01T00:00+07':n===10?'2026-09-10T00:00+07':undefined,n===11?'cancelled':undefined)
await pay(101,1,20,'2026-10-31T23:59:59.999+07');await pay(104,4,400,'2026-10-15T00:00+07');await pay(107,7,100,'2026-10-15T00:00+07');await pay(108,8,200,'2026-10-15T00:00+07');await pay(112,12,150,'2026-10-20T00:00+07')
await db.exec(`create trigger aud_o after insert or update or delete on v100_orders for each row execute function audit_fixture();create trigger aud_p after insert or update or delete on v100_payments for each row execute function audit_fixture();`)
await pay(102,1,80,'2026-11-01T00:00+07')
await db.exec(`update v100_orders set status='cancelled' where id='${id(2)}';update v100_orders set total=900 where id='${id(3)}';update v100_orders set total=950 where id='${id(3)}';delete from v100_orders where id='${id(6)}';delete from v100_payments where id='${id(107)}';update v100_payments set amount=20 where id='${id(108)}';`)
await pay(109,9,50,'2026-10-01T00:00+07') // backdated INSERT made in November: not present at cutoff
await order(14,9999) // backdated new order also must not exist at cutoff
// 1205 pre-existing open orders: no PostgREST 1000-row truncation for JSON report.
await db.exec(`alter table v100_orders disable trigger aud_o;insert into v100_orders select md5('bulk'||i)::uuid,'BULK-'||i,'${id(99)}','received',1,0,'2026-10-31T23:59:59.999+07' from generate_series(1,1205)i;alter table v100_orders enable trigger aud_o;`)
const snap=async()=>JSON.stringify(await Promise.all(['v100_orders','v100_payments','v113035_audit_log'].map(t=>db.query('select * from '+t+' order by id'))))
const before=await snap(),sql=await readFile('SQL_088_PIUTANG_PER_TANGGAL.sql','utf8');await db.exec(sql);await db.exec(sql)
const report=async(date)=>(await db.query('select v113168_receivables_as_of($1) r',[date])).rows[0].r
const oct=await report('2026-10-31'),byNo=Object.fromEntries(oct.rows.map(r=>[r.order_no,r]))
assert.equal(oct.count,1213);assert.equal(oct.rows.length,1213);assert.equal(oct.total,1205+80+200+300+500+500+400+50+80)
assert.equal(byNo['HL-1'].paid_amount,20);assert.equal(byNo['HL-2'].status,'received');assert.equal(byNo['HL-3'].total,300);assert.equal(byNo['HL-6']._exists_now,false);assert.equal(byNo['HL-7'].paid_amount,100);assert.equal(byNo['HL-8'].paid_amount,200);assert.equal(byNo['HL-9'].paid_amount,0)
for(const n of [4,5,11,12,13,14])assert.equal(byNo['HL-'+n],undefined)
assert.equal(new Set(oct.rows.map(r=>r.id)).size,1213)
const sep=await report('2026-09-30');assert.equal(sep.total,80);assert.equal(sep.count,1)
assert.equal(before,await snap(),'report/migration do not mutate transactions or audit history')
await db.exec("set role authenticated;set test.actor='finance'");assert.equal((await report('2026-10-31')).total,oct.total)
await db.exec("set test.actor='employee'");await assert.rejects(report('2026-10-31'),/Akses Keuangan/)
await db.exec("set test.actor='anon'");await assert.rejects(report('2026-10-31'),/Akses Keuangan/)
await db.exec("set test.actor='owner'");await assert.rejects(report('2099-01-01'),/tanggal/);await assert.rejects(report(null),/tanggal/)
await db.exec('reset role;set role anon');await assert.rejects(report('2026-10-31'),/permission denied/)
await db.close();console.log('PASS SQL088: 1205+ rows, WIB end-of-month, November payments excluded, partial/full/overpayments, previous-month carryover; order corrections/cancellation/deletion and payment corrections/deletion restored via audit; new backdated records excluded; exact totals; Finance/Owner-only, future-date rejection, idempotence and zero data writes.')
