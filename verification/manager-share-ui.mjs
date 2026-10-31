import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {writeFile,unlink} from 'node:fs/promises'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/payroll'})
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
const dataset={v109_users:[{id:'a',full_name:'Pengelola',login_id:'A',is_active:true},{id:'b',full_name:'Pekerja',login_id:'B',is_active:true}],v111_employee_payroll_settings:[{employee_id:'a',attendance_rate:0,monthly_allowance:20000},{employee_id:'b',attendance_rate:0,monthly_allowance:30000}],v113_payroll_payments:[{id:'pay1',employee_id:'a',amount:10000,paid_at:'2026-10-03T00:00:00Z'}],v113072_cash_advance_deductions:[{id:'ded1',employee_id:'a',amount:5000}]}
const shares=new Map();let failed=false,saveFailed=false,mutations=0
const report=month=>({payroll_month:month,revenue:200000,operating:50000,employee_cost:50000,profit_base:100000,rows:shares.has(month)?[{employee_id:'a',full_name:'Pengelola',percent:shares.get(month),amount:100000*shares.get(month)/100,updated_at:''}]:[]})
globalThis.__mock={from(table){const q={select(){return q},eq(){return q},gte(){return q},lte(){return q},order(){return q},then(ok){return Promise.resolve({data:dataset[table]||[],error:null}).then(ok)}};return q},async rpc(name,args){
 if(name==='v113151_manager_report')return {data:failed?null:report(args.p_month),error:failed?{message:'function missing'}:null}
 if(name==='v113151_save_manager_share'){mutations++;if(saveFailed)return {error:{message:'Simpan gagal'}};assert.equal(args.p_employee,'a');shares.set(args.p_month,args.p_percent);return {error:null}}
 throw new Error('unexpected RPC '+name)
}}
const bundle=await build({stdin:{contents:`export {PayrollPage} from './src/pages/PayrollPage';export {buildPayrollExport} from './src/lib/payrollExport';export {loadPayrollExpenseRows} from './src/lib/payrollExpense';export {managerSharesForRange} from './src/lib/managerShare';export {fetchFinancialSummary} from './src/lib/financialSummary';`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'esm',packages:'external',jsx:'automatic',plugins:[{name:'mock',setup(b){b.onResolve({filter:/lib\/supabase$|\.\/supabase$/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const supabase=globalThis.__mock'}))}}]})
const file='verification/.manager-ui-test.mjs';await writeFile(file,bundle.outputFiles[0].text)
const {PayrollPage,buildPayrollExport,loadPayrollExpenseRows,managerSharesForRange,fetchFinancialSummary}=await import('./.manager-ui-test.mjs');const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');const {MemoryRouter}=await import('react-router-dom');const root=createRoot(document.getElementById('root'))
let revision=0
const mount=()=>act(async()=>root.render(React.createElement(MemoryRouter,{key:++revision},React.createElement(PayrollPage))))
const click=async text=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(button,text);await act(async()=>button.click())}
const input=async(selector,value)=>act(async()=>{const el=document.querySelector(selector);assert.ok(el,selector);const proto=el.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));el.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
const textValue=label=>[...document.querySelectorAll('.payroll-detail-summary>div')].find(el=>el.querySelector('span')?.textContent===label)?.querySelector('b')?.textContent.replace(/[\s\u00a0]/g,'')
await mount();await click('Daftar Gaji');assert.match(document.body.textContent,/Belum ada pengelola/)
await input('select[aria-label="Karyawan pengelola"]','a');assert.equal(document.querySelector('input[aria-label="Bagian pengelola (%)"]').value,'40')
await click('Simpan Bagi Hasil Pengelola');assert.equal(mutations,1)
await click('Detail');assert.equal(textValue('Bagi Hasil Pengelola'),'Rp40.000');assert.equal(textValue('Gaji Kotor'),'Rp60.000');assert.equal(textValue('Sisa Gaji'),'Rp45.000','cashbon applied 5k and payment10k remain separate')
await act(async()=>document.querySelector('.modal-backdrop button[aria-label="Tutup"]').click())
// Only named employee gets share; worker salary remains unchanged.
let worker=[...document.querySelectorAll('table.payroll-table tbody tr')].find(tr=>tr.textContent.includes('Pekerja'));assert.ok(worker);assert.match(worker.textContent.replace(/[\s\u00a0]/g,''),/Rp30.000/);assert.doesNotMatch(worker.textContent.replace(/[\s\u00a0]/g,''),/Rp40.000/)
await input('select[aria-label="Karyawan pengelola"]','a');await input('input[aria-label="Bagian pengelola (%)"]','35');saveFailed=true;await click('Simpan Bagi Hasil Pengelola');assert.match(document.body.textContent,/Simpan gagal/);assert.equal([...shares.values()][0],40)
saveFailed=false;await click('Simpan Bagi Hasil Pengelola');await click('Detail');assert.equal(textValue('Bagi Hasil Pengelola'),'Rp35.000');await act(async()=>document.querySelector('.modal-backdrop button[aria-label="Tutup"]').click())
// Use selected month from actual report stored by UI (no device-time assumptions).
const month=[...shares.keys()][0]
const full=await managerSharesForRange(month,month.slice(0,8)+'31');assert.equal(full[0].report.rows[0].amount,35000)
const partial=await managerSharesForRange(month,month.slice(0,8)+'15');assert.equal(partial[0].ratio,15/31,'partial reports allocate the monthly right by selected days')
const expenses=await loadPayrollExpenseRows(month,month.slice(0,8)+'31');assert.equal(expenses.find(r=>r.employee_id==='a').manager_share,35000);assert.equal(expenses.find(r=>r.employee_id==='a').gross_payroll,55000);assert.equal(expenses.find(r=>r.employee_id==='b').gross_payroll,30000)
const financial=await fetchFinancialSummary(month,month.slice(0,8)+'31');assert.equal(financial.managerShare,35000);assert.equal(financial.employeeCost,85000,'financial cost includes management once')
const option=buildPayrollExport([{employee:{full_name:'Pengelola'},presentDays:0,attendanceRate:0,attendancePay:0,allowance:20000,bonus:0,managerShare:35000,managerPercent:35,managerBase:100000,shareDetails:[],productionCommission:0,courierCommission:0,grossTotal:55000,cashAdvanceApplied:5000,cashAdvanceOutstanding:0,total:50000,payrollBalance:50000,paidAmount:10000,outstanding:40000,paymentStatus:'partial'}],month,0)
assert.equal(option.rows[0][option.headers.indexOf('Bagi Hasil Pengelola')],35000);assert.equal(option.rows[0][option.headers.indexOf('Persentase Pengelola')],'35%')
failed=true;await mount();await click('Daftar Gaji');assert.match(document.body.textContent,/SQL 080/);assert.equal(document.querySelector('.payroll-list-panel'),null);assert.ok([...document.querySelectorAll('button')].find(b=>b.textContent==='XLS').disabled)
await click('Daftar Hadir');assert.ok(document.body.textContent.includes('Pengelola'),'attendance remains available if migration missing')
await act(async()=>root.unmount());await unlink(file)
console.log('PASS V151 UI: select named manager/default40%, save/edit/failure, unrelated salary unchanged, gross/net/payment/deduction, detailed payroll, numeric XLS, financial/payroll expense share once, missing SQL blocks salary export/payment while attendance remains available.')
