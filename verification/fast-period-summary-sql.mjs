import {PGlite} from '@electric-sql/pglite'
import {build} from 'esbuild'
import {readFile,writeFile,unlink} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import assert from 'node:assert/strict'
const db=new PGlite()
await db.exec(`create role anon;create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql as $$select '00000000-0000-0000-0000-000000000099'::uuid$$;
create function v109_is_owner() returns boolean language sql as $$select current_setting('test.actor',true)='owner'$$;
create function v113122_can_manage_cash_advance() returns boolean language sql as $$select current_setting('test.actor',true) in('owner','finance')$$;
set test.actor='owner';
create table v109_users(id uuid primary key,full_name text);
create table v100_orders(id uuid primary key,total numeric,paid_amount numeric,status text,created_at timestamptz);
create view v100_orders_view as select * from v100_orders;
create table v100_payments(id uuid primary key,amount numeric,created_at timestamptz);
create table v100_services(id uuid primary key,category text);
create table v100_order_items(id uuid primary key,order_id uuid,service_id uuid,subtotal numeric);
create table v106_expenses(id uuid primary key,expense_date date,category_name text,group_name text,amount numeric);
create view v106_expenses_view as select * from v106_expenses;
create table v111_attendance(employee_id uuid,attendance_date date,status text);
create table v111_employee_payroll_settings(employee_id uuid,attendance_rate numeric,monthly_allowance numeric);
create table v111_payroll_adjustments(employee_id uuid,payroll_month date,bonus numeric);
create table v111_employee_revenue_shares(employee_id uuid,category text,share_percent numeric);
create table v113_commission_ledger(order_id uuid,employee_id uuid,commission_type text,base_amount numeric,percent numeric,amount numeric,earned_at timestamptz);
create table v113095_reserve_settings(reserve_type text,method text,monthly_amount numeric,revenue_percent numeric,is_active boolean);
`)
let manager=await readFile('supabase/080_v113_0_151_manager_profit_share.sql','utf8');manager=manager.slice(0,manager.indexOf('create or replace function public.v113151_save_manager_share'))+'commit;';await db.exec(manager)
const e='00000000-0000-0000-0000-000000000001',service='00000000-0000-0000-0000-000000000002'
await db.exec(`insert into v109_users values('${e}','Karyawan');insert into v100_services values('${service}','Kiloan');insert into v111_employee_payroll_settings values('${e}',10000,100000);
insert into v111_attendance values('${e}','2026-10-01','present'),('${e}','2026-10-20','present'),('${e}','2026-11-01','present');
insert into v111_payroll_adjustments values('${e}','2026-10-01',55555),('${e}','2026-11-01',10000);insert into v111_employee_revenue_shares values('${e}','Kiloan',5);
insert into v113095_reserve_settings values('thr','fixed',700000,0,true),('other','percent_revenue',0,2,true),('inactive','fixed',999999,0,false);
insert into v106_expenses values(gen_random_uuid(),'2026-10-10','Listrik','Operasional',150000),(gen_random_uuid(),'2026-10-10','Gaji','SDM',990000),(gen_random_uuid(),'2026-11-01','Air',null,50000);
insert into v113151_manager_shares(payroll_month,employee_id,share_percent) values('2026-10-01','${e}',40),('2026-11-01','${e}',35);
insert into v100_orders select gen_random_uuid(),10000+i,case when i%2=0 then 10000+i else 0 end,'received','2026-10-01T00:00:00+07'::timestamptz+(i%30)*interval '1 day' from generate_series(1,1205)i;
insert into v100_order_items select gen_random_uuid(),id,'${service}',total from v100_orders;
insert into v113_commission_ledger select id,'${e}','production',total,20,round(total*0.2,2),created_at from v100_orders;
insert into v100_payments select gen_random_uuid(),paid_amount,created_at from v100_orders where paid_amount>0;
insert into v100_orders values(gen_random_uuid(),99999,0,'cancelled','2026-10-20T12:00+07'),(gen_random_uuid(),200000,50000,'received','2026-10-31T23:59:59.999+07'),(gen_random_uuid(),300000,0,'received','2026-11-01T00:00+07');`)
const sql=await readFile('SQL_086_PERCEPAT_RINGKASAN_PERIODE.sql','utf8');await db.exec(sql);await db.exec(sql)
const safe=s=>{assert.match(s,/^[a-zA-Z_][\w.]*$/);return s}
globalThis.__db={from(table){let cols='*',filters=[],params=[],sort=[],lo=null,hi=null;const q={select(c){cols=c;return q},gte(c,v){params.push(v);filters.push(safe(c)+'>=$'+params.length);return q},lte(c,v){params.push(v);filters.push(safe(c)+'<=$'+params.length);return q},lt(c,v){params.push(v);filters.push(safe(c)+'<$'+params.length);return q},order(c,{ascending=true}={}){sort.push(safe(c)+(ascending?' asc':' desc'));return q},range(a,b){lo=a;hi=b;return q},then(ok){const query='select '+(cols==='*'?'*':cols.split(',').map(safe).join(','))+' from '+safe(table)+(filters.length?' where '+filters.join(' and '):'')+(sort.length?' order by '+sort.join(','):'')+(lo===null?'':' limit '+(hi-lo+1)+' offset '+lo);return db.query(query,params).then(r=>({data:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v instanceof Date?(r.fields.find(f=>f.name===k)?.dataTypeID===1082?v.toISOString().slice(0,10):v.toISOString()):v]))),error:null})).then(ok)}};return q},async rpc(name,args){try{const r=await db.query('select '+safe(name)+'('+Object.values(args).map((_,i)=>'$'+(i+1)).join(',')+') r',Object.values(args));return {data:r.rows[0].r,error:null}}catch(e){return {data:null,error:e}}}}
// Compare the new actual SQL to the previous release's actual JS formula.
const legacy=execFileSync('python3',['-c',"import zipfile;print(zipfile.ZipFile('../HappyLaundry_V113_0_164_Tampilan_Profesional.zip').read('src/lib/financialSummary.ts').decode())"],{encoding:'utf8'})
const bundled=await build({stdin:{contents:legacy,resolveDir:process.cwd()+'/src/lib',loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',packages:'external',plugins:[{name:'db',setup(b){b.onResolve({filter:/supabase$/},a=>({path:a.path,namespace:'db'}));b.onLoad({filter:/.*/,namespace:'db'},()=>({contents:'export const supabase=globalThis.__db'}))}}]})
const file='verification/.legacy-summary-oracle.mjs';await writeFile(file,bundled.outputFiles[0].text);const {fetchFinancialSummary}=await import('./.legacy-summary-oracle.mjs')
for(const [from,to] of [['2026-10-01','2026-10-31'],['2026-10-10','2026-10-20'],['2026-10-20','2026-11-10'],['2024-02-01','2024-02-29'],['2026-11-01','2026-11-30']]){
 const expected=await fetchFinancialSummary(from,to),actual=(await db.query('select v113165_financial_summary($1,$2) r',[from,to])).rows[0].r
 for(const key of Object.keys(expected))assert.ok(Math.abs(expected[key]-Number(actual[key]))<0.00001,`${from} ${key}: ${expected[key]} vs ${actual[key]}`)
}
await db.exec("set test.actor='finance';set role authenticated");await db.query("select v113165_financial_summary('2026-10-01','2026-10-31')");await db.exec("set test.actor='none'");await assert.rejects(db.query("select v113165_financial_summary('2026-10-01','2026-10-31')"),/Akses Keuangan/)
await db.exec("set test.actor='owner'");await assert.rejects(db.query("select v113165_financial_summary('2026-11-02','2026-11-01')"),/tidak valid/)
await db.exec('reset role');assert.equal((await db.query('select count(*) n from v100_orders')).rows[0].n,1208)
await unlink(file);await db.close();console.log('PASS SQL086: idempotent migration; 1205+ orders beyond API cap; actual V164 formula matches all 17 fields for full/partial/cross-month/leap-year and WIB midnight; attendance, prorated allowance/bonus/reserves, manager share, commissions, cancellations; Finance/Owner-only and invalid range; no transaction changes.')
