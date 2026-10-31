import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {writeFile,unlink} from 'node:fs/promises'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/payroll'})
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
const dataset={
 v109_users:[{id:'cece',full_name:'CECE ADI R',login_id:'CECEADI',is_active:true}],
 v111_employee_payroll_settings:[{employee_id:'cece',attendance_rate:10000,monthly_allowance:100000}],
 v111_attendance:Array.from({length:24},(_,i)=>({id:String(i),employee_id:'cece',attendance_date:`2026-10-${String(i+1).padStart(2,'0')}`,status:'present'})),
 v113_commission_ledger:[{employee_id:'cece',order_id:'p',order_no:'P',commission_type:'production',amount:5000,earned_at:'2026-10-05T00:00:00Z'},{employee_id:'cece',order_id:'c',order_no:'C',commission_type:'courier',amount:1717200,earned_at:'2026-10-05T00:00:00Z'}],
 v113072_employee_cash_advances:[{id:'loan',employee_id:'cece',amount:4800000,remaining_amount:2737800,issued_at:'2026-10-01T00:00:00Z',cancelled_at:null}],
 v113072_cash_advance_deductions:[{id:'ded',cash_advance_id:'loan',employee_id:'cece',payroll_month:'2026-10-01',amount:2062200,created_at:'2026-10-01T00:00:00Z'}],
 v113152_deduction_corrections:[],v113_payroll_payments:[]
}
let mutationCount=0,fail=false,pending=null,readFailure=false;const saved=[]
globalThis.__mock={from(table){let lo=0,hi=999;const filters=[];const q={select(){return q},eq(k,v){filters.push([k,'eq',v]);return q},gte(k,v){filters.push([k,'gte',v]);return q},lte(k,v){filters.push([k,'lte',v]);return q},order(){return q},range(a,b){lo=a;hi=b;return q},then(ok){return Promise.resolve({data:(dataset[table]||[]).filter(r=>filters.every(([k,op,v])=>op==='eq'?r[k]===v:op==='gte'?r[k]>=v:r[k]<=v)).slice(lo,hi+1),error:readFailure&&table==='v113152_deduction_corrections'?{message:'SQL081 missing'}:null}).then(ok)}};return q},async rpc(name,args){
 if(name==='v113151_manager_report')return {data:{rows:[],profit_base:7260585},error:null}
 assert.equal(name,'v113152_correct_payroll_deduction');mutationCount++;saved.push(args);if(pending)await pending;if(fail)throw Error('Jaringan terputus')
 const beforeDeductions=structuredClone(dataset.v113072_cash_advance_deductions)
 const old=Number(dataset.v113072_cash_advance_deductions[0]?.amount||0)
 if(old!==args.p_expected_amount)return {error:{message:'Potongan sudah berubah'}}
 dataset.v113072_employee_cash_advances[0].remaining_amount+=old-args.p_new_amount
 dataset.v113072_cash_advance_deductions[0].amount=args.p_new_amount
 dataset.v113152_deduction_corrections.push({id:String(mutationCount),employee_id:args.p_employee_id,payroll_month:args.p_payroll_month,old_amount:old,new_amount:args.p_new_amount,new_remaining:dataset.v113072_employee_cash_advances[0].remaining_amount,reason:args.p_reason,created_at:'2026-10-31T07:00:00Z',before_details:{deductions:beforeDeductions},after_details:{deductions:structuredClone(dataset.v113072_cash_advance_deductions)}})
 return {data:{new_amount:args.p_new_amount},error:null}
}}
const bundle=await build({stdin:{contents:`export {PayrollPage} from './src/pages/PayrollPage'`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'esm',packages:'external',jsx:'automatic',plugins:[{name:'mock',setup(b){b.onResolve({filter:/lib\/supabase$|\.\/supabase$/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const supabase=globalThis.__mock'}))}}]})
const file='verification/.deduction-correction-ui.mjs';await writeFile(file,bundle.outputFiles[0].text);const {PayrollPage}=await import('./.deduction-correction-ui.mjs');const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');const {MemoryRouter}=await import('react-router-dom');const root=createRoot(document.getElementById('root'))
const click=async label=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===label);assert.ok(b,label);await act(async()=>b.click())}
const input=async(selector,value)=>act(async()=>{const el=document.querySelector(selector);assert.ok(el,selector);Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));el.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
const detailValue=label=>[...document.querySelectorAll('.payroll-detail-summary>div')].find(d=>d.querySelector('span')?.textContent===label)?.querySelector('b')?.textContent.replace(/[\s\u00a0]/g,'')
await act(async()=>root.render(React.createElement(MemoryRouter,null,React.createElement(PayrollPage))))
await input('input[type="month"]','2026-10');await click('Daftar Gaji');await click('Detail');assert.equal(detailValue('Potongan Kas Bon'),'−Rp2.062.200')
await click('Potongan Kasbon');await click('Koreksi Potongan Bulan 2026-10');assert.match(document.body.textContent,/2026-10/)
await input('input[aria-label="Total Potongan Baru"]','300000');await input('input[aria-label="Alasan Koreksi Potongan"]','Salah input, seharusnya Rp300.000')
const preview=document.querySelector('[aria-label="Pratinjau koreksi"]').textContent.replace(/[\s\u00a0]/g,'');assert.match(preview,/Rp4.500.000/);assert.match(preview,/Rp1.762.200/)
fail=true;await click('Simpan Koreksi Potongan');assert.match(document.body.textContent,/Jaringan terputus/);assert.equal(document.querySelector('input[aria-label="Total Potongan Baru"]').value,'300000');assert.equal(dataset.v113072_cash_advance_deductions[0].amount,2062200)
fail=false;let release;pending=new Promise(r=>release=r)
const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='Simpan Koreksi Potongan');await act(async()=>{button.click();button.click()});assert.equal(mutationCount,2,'one failed attempt plus only one request for double click')
await act(async()=>{release();pending=null});assert.deepEqual(saved.at(-1),{p_employee_id:'cece',p_payroll_month:'2026-10-01',p_expected_amount:2062200,p_new_amount:300000,p_reason:'Salah input, seharusnya Rp300.000'})
await click('Detail');assert.equal(detailValue('Potongan Kas Bon'),'−Rp300.000');assert.equal(detailValue('Sisa Kas Bon'),'Rp4.500.000');assert.equal(detailValue('Sisa Gaji'),'Rp1.762.200');assert.equal(dataset.v113072_employee_cash_advances[0].amount,4800000)
await click('Potongan Kasbon');await click('Koreksi Potongan Bulan 2026-10');assert.match(document.querySelector('.payroll-deduction-history .deduction-correction-history').textContent,/Salah input, seharusnya Rp300.000/)
await click('Tutup')
await click('Potongan Kasbon');assert.equal(document.querySelector('input[aria-label="Total Potongan Baru"]'),null,'history opens without editing form');assert.ok(document.querySelector('input[type=checkbox]').checked,'history defaults to all months');await click('Koreksi Potongan Bulan 2026-10');assert.equal(document.querySelector('input[aria-label="Total Potongan Baru"]').value,'300000');await click('Tutup')
// Paid salary can view audit but cannot save correction.
dataset.v113_payroll_payments.push({id:'paid',employee_id:'cece',payroll_month:'2026-10-01',amount:1000,paid_at:'2026-10-31T07:00:00Z'})
await act(async()=>root.render(React.createElement(MemoryRouter,{key:'paid'},React.createElement(PayrollPage))));await input('input[type="month"]','2026-10');await click('Daftar Gaji');await click('Potongan Kasbon');assert.match(document.body.textContent,/Gaji bulan ini sudah memiliki pembayaran/);assert.ok([...document.querySelectorAll('button')].find(b=>b.textContent==='Koreksi Potongan Bulan 2026-10').disabled)
await click('Tutup');readFailure=true;await click('Potongan Kasbon');assert.match(document.body.textContent,/SQL 081/);assert.ok([...document.querySelectorAll('button')].find(b=>b.textContent==='XLS Riwayat').disabled)
await act(async()=>root.unmount());await unlink(file)
console.log('PASS V152 UI: actual payroll detail/list entrypoints; Cece preview and saved salary/debt; exact employee/month/expected total; network retry preserves input; double click one request; reason audit visible; paid and missing SQL blocked; principal unchanged.')
