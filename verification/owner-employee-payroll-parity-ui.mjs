import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {writeFile,unlink} from 'node:fs/promises'
import {JSDOM} from 'jsdom'
process.env.TZ='America/Los_Angeles'
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/payroll'});globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.__role='owner'
const entry=(n,employee,type,amount,time='2026-10-15T05:00:00Z')=>({order_id:'O'+String(n).padStart(5,'0'),order_no:'HL-'+n,employee_id:employee,commission_type:type,amount,base_amount:amount*5,percent:20,earned_at:time})
const ledger=[...Array.from({length:134},(_,i)=>entry(i,'santos','production',i===133?229175:10000)),...Array.from({length:866},(_,i)=>entry(i+134,'other','production',1000)),entry(1000,'santos','production',330500),entry(1001,'santos','courier',112500),entry(1002,'santos','production',0,'2026-09-30T17:00:00Z'),entry(1003,'santos','production',0,'2026-10-31T16:59:59.999Z'),entry(1004,'santos','production',9999999,'2026-09-30T16:59:59.999Z'),entry(1005,'santos','production',9999999,'2026-10-31T17:00:00Z')]
const sum=(rows,type)=>rows.filter(r=>r.employee_id==='santos'&&r.commission_type===type).reduce((s,r)=>s+r.amount,0)
assert.equal(sum(ledger.slice(0,1000),'production'),1559175);assert.equal(sum(ledger.slice(0,1000),'courier'),0,'reproduce screenshot of truncated owner query')
const own=()=>ledger.filter(r=>r.employee_id==='santos'&&new Date(r.earned_at)>=new Date('2026-10-01T00:00:00+07:00')&&new Date(r.earned_at)<new Date('2026-11-01T00:00:00+07:00'))
const dataset={v109_users:[{id:'santos',full_name:'SANTOS',login_id:'SANTOS',is_active:true},{id:'other',full_name:'LAIN',login_id:'LAIN',is_active:true}],v111_employee_payroll_settings:[{employee_id:'santos',attendance_rate:10000,monthly_allowance:0}],v111_attendance:Array.from({length:29},(_,i)=>({id:'day'+i,employee_id:'santos',attendance_date:`2026-10-${String(i+1).padStart(2,'0')}`,status:'present'})),v113_commission_ledger:ledger,v113072_employee_cash_advances:[{id:'loan',employee_id:'santos',amount:4100000,remaining_amount:2400000,cancelled_at:null,issued_at:'2026-10-01T00:00:00Z'}],v113072_cash_advance_deductions:[{id:'ded',employee_id:'santos',cash_advance_id:'loan',payroll_month:'2026-10-01',amount:1700000}]}
let failPage=false,duplicatePage=false;const calls=[]
globalThis.__mock={from(table){const filters=[],sort=[];let lo=0,hi=999;const q={select(){return q},eq(k,v){filters.push([k,'eq',v]);return q},gte(k,v){filters.push([k,'gte',v]);return q},lte(k,v){filters.push([k,'lte',v]);return q},lt(k,v){filters.push([k,'lt',v]);return q},order(k,opt){sort.push([k,opt?.ascending!==false]);return q},range(a,b){lo=a;hi=b;return q},then(ok){
 calls.push({table,lo,hi,filters,sort})
 const compare=(k,a,b)=>k==='earned_at'||k==='created_at'?new Date(a)-new Date(b):a<b?-1:a>b?1:0
 const all=(dataset[table]||[]).filter(r=>filters.every(([k,op,v])=>{const c=compare(k,r[k],v);return op==='eq'?r[k]===v:op==='gte'?c>=0:op==='lt'?c<0:c<=0})).sort((a,b)=>{for(const[k,asc]of sort){const c=compare(k,a[k],b[k]);if(c)return asc?c:-c}return 0})
 let rows=all.slice(lo,hi+1);if(duplicatePage&&table==='v113_commission_ledger'&&lo===100)rows=[all[0],...rows.slice(1)]
 return Promise.resolve({data:failPage&&table==='v113_commission_ledger'&&lo>=100?null:rows,error:failPage&&table==='v113_commission_ledger'&&lo>=100?{message:'Trang komisi gagal'}:null}).then(ok)
 }};return q},async rpc(name,args){
 if(name==='v113151_manager_report')return {data:{payroll_month:args.p_month,revenue:0,operating:0,employee_cost:3158175,profit_base:-3158175,rows:[]},error:null}
 if(name==='v113072_my_payroll_base')return {data:{employee:{id:'santos',full_name:'SANTOS',login_id:'SANTOS'},present_days:29,attendance_rate:10000,allowance:0,bonus:0,cash_advance_applied:1700000,cash_advance_outstanding:2400000,paid_amount:0},error:null}
 if(name==='v113072_my_commissions')return {data:own(),error:null}
 if(name==='v113072_my_revenue_share')return {data:0,error:null}
 if(name==='v113151_my_manager_share')return {data:{percent:0,amount:0},error:null}
 throw Error('Unexpected mutation '+name)
}}
const bundle=await build({stdin:{contents:`export {PayrollPage} from './src/pages/PayrollPage';export {MyPayrollPage} from './src/pages/MyPayrollPage';export {loadCommissionLedger} from './src/lib/commissionLedger';export {loadPayrollExpenseRows} from './src/lib/payrollExpense';export {fetchFinancialSummary} from './src/lib/financialSummary';`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'esm',packages:'external',jsx:'automatic',plugins:[{name:'mock',setup(b){b.onResolve({filter:/lib\/supabase$|\.\/supabase$/},a=>({path:a.path,namespace:'db'}));b.onLoad({filter:/.*/,namespace:'db'},()=>({contents:'export const supabase=globalThis.__mock'}));b.onResolve({filter:/lib\/auth$/},a=>({path:a.path,namespace:'auth'}));b.onLoad({filter:/.*/,namespace:'auth'},()=>({contents:'export const useAuth=()=>({profile:{role:globalThis.__role}})'}))}}]})
const file='verification/.payroll-parity-ui.mjs';await writeFile(file,bundle.outputFiles[0].text);const {PayrollPage,MyPayrollPage,loadCommissionLedger,loadPayrollExpenseRows,fetchFinancialSummary}=await import('./.payroll-parity-ui.mjs');const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');const {MemoryRouter}=await import('react-router-dom');const root=createRoot(document.getElementById('root'));let revision=0
const mount=page=>act(async()=>root.render(React.createElement(MemoryRouter,{key:++revision},React.createElement(page))))
const click=async label=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===label);assert.ok(b,label);await act(async()=>b.click())}
const input=async(selector,value)=>act(async()=>{const el=document.querySelector(selector);Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));el.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
const norm=s=>s.replace(/[\s\u00a0]/g,'')
const detail=(selector,label)=>norm([...document.querySelectorAll(selector)].find(r=>r.querySelector('span')?.textContent===label)?.querySelector('b')?.textContent||'')
await mount(PayrollPage);await input('input[type=month]','2026-10');await click('Daftar Gaji')
const row=[...document.querySelectorAll('.payroll-table tbody tr')].find(r=>r.textContent.includes('SANTOS'));await act(async()=>[...row.querySelectorAll('button')].find(b=>b.textContent==='Detail').click())
assert.equal(detail('.payroll-detail-summary>div','Produksi'),'Rp1.889.675');assert.equal(detail('.payroll-detail-summary>div','Kurir'),'Rp112.500');assert.equal(detail('.payroll-detail-summary>div','Gaji Kotor'),'Rp2.292.175');assert.equal(detail('.payroll-detail-summary>div','Sisa Gaji'),'Rp592.175')
assert.ok(calls.some(c=>c.table==='v113_commission_ledger'&&c.lo>=1000),'owner reads beyond first1000 global rights')
assert.ok(calls.some(c=>c.table==='v113_commission_ledger'&&c.filters.some(f=>f[0]==='earned_at'&&f[1]==='lt'&&f[2]==='2026-11-01T00:00:00+07:00')))
const full=await loadCommissionLedger('2026-10-01','2026-10-31');assert.equal(full.error,null);assert.equal(full.data.length,1004);assert.equal(new Set(full.data.map(r=>r.order_id+'|'+r.employee_id+'|'+r.commission_type)).size,1004)
const expense=await loadPayrollExpenseRows('2026-10-01','2026-10-31');assert.equal(expense.find(r=>r.employee_id==='santos').gross_payroll,2292175)
const fin=await fetchFinancialSummary('2026-10-01','2026-10-31');assert.equal(fin.productionCommission,2755675);assert.equal(fin.courierCommission,112500)
ledger.find(r=>r.order_id==='O01002').amount=200;const edgeExpense=await loadPayrollExpenseRows('2026-10-01','2026-10-31');assert.equal(edgeExpense.find(r=>r.employee_id==='santos').gross_payroll,2292375,'WIB midnight commission stays in October even on US/Pacific device');ledger.find(r=>r.order_id==='O01002').amount=0
globalThis.__role='employee';await mount(MyPayrollPage);await input('input[type=month]','2026-10');assert.equal(detail('.my-payroll-grid>div','Komisi Produksi'),'Rp1.889.675');assert.equal(detail('.my-payroll-grid>div','Komisi Kurir'),'Rp112.500');assert.equal(detail('.my-payroll-grid>div','Gaji Kotor'),'Rp2.292.175');assert.equal(detail('.my-payroll-grid>div','Sisa Gaji Belum Dibayar'),'Rp592.175','owner equals employee for the same month and ledger')
failPage=true;globalThis.__role='owner';await mount(PayrollPage);await input('input[type=month]','2026-10');await click('Daftar Gaji');assert.match(document.body.textContent,/Komisi belum dimuat lengkap/);assert.equal(document.querySelector('.payroll-list-panel'),null);assert.ok([...document.querySelectorAll('button')].find(b=>b.textContent==='XLS').disabled,'partial query cannot pay or export incomplete salaries')
const partial=await loadCommissionLedger('2026-10-01','2026-10-31');assert.equal(partial.data,null)
failPage=false;duplicatePage=true;const duplicate=await loadCommissionLedger('2026-10-01','2026-10-31');assert.equal(duplicate.data,null);assert.match(duplicate.error.message,/duplikasi/)
await act(async()=>root.unmount());await unlink(file)
console.log('PASS V156: reproduces old Santos owner1,559,175/0 vs self1,889,675/112,500; paged owner now matches gross2,292,175/net592,175; >1000 rights, stable keys/timestamp ties, WIB month bounds, expenses/finance include all commissions, partial/duplicate page fails closed, no financial writes.')
