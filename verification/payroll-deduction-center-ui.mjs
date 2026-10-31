import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {writeFile,unlink} from 'node:fs/promises'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/payroll'});globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
const data={v109_users:[{id:'a',full_name:'CECE',login_id:'A',is_active:true},{id:'b',full_name:'SANTOS',login_id:'B',is_active:true},{id:'c',full_name:'HARIS',login_id:'C',is_active:true}],v111_employee_payroll_settings:[{employee_id:'a',attendance_rate:0,monthly_allowance:1000000},{employee_id:'b',attendance_rate:0,monthly_allowance:1000000}],v113072_employee_cash_advances:[{id:'loanA',employee_id:'a',amount:600000,remaining_amount:600000,issued_at:'2026-10-01T00:00:00Z',cancelled_at:null},{id:'loanC',employee_id:'c',amount:100000,remaining_amount:100000,issued_at:'2026-10-01T00:00:00Z',cancelled_at:null}],v113072_cash_advance_deductions:[],v113152_deduction_corrections:[]}
const mutations=[];let held=null,fail=false
const debt=id=>(data.v113072_employee_cash_advances||[]).filter(r=>r.employee_id===id).reduce((s,r)=>s+r.remaining_amount,0)
globalThis.__mock={from(table){const filters=[];let lo=0,hi=999;const q={select(){return q},eq(k,v){filters.push([k,'eq',v]);return q},gte(k,v){filters.push([k,'gte',v]);return q},lt(k,v){filters.push([k,'lt',v]);return q},lte(k,v){filters.push([k,'lte',v]);return q},order(){return q},range(a,b){lo=a;hi=b;return q},then(ok){return Promise.resolve({data:(data[table]||[]).filter(r=>filters.every(([k,op,v])=>op==='eq'?r[k]===v:op==='gte'?r[k]>=v:op==='lt'?r[k]<v:r[k]<=v)).slice(lo,hi+1),error:null}).then(ok)}};return q},async rpc(name,args){
 if(name==='v113151_manager_report')return {data:{rows:[],profit_base:10000000},error:null}
 if(name==='v113137_cash_advance_limits')return {data:[{employee_id:args.p_employee_id,payroll_month:'2026-10-01',salary_available:1000000,outstanding:debt(args.p_employee_id),gross:1000000}],error:null}
 mutations.push({name,args});if(held)await held;if(fail)throw Error('Koneksi putus')
 if(name==='v113137_add_cash_advance'){data.v113072_employee_cash_advances.push({id:'new',employee_id:args.p_employee_id,amount:args.p_amount,remaining_amount:args.p_amount,issued_at:'2026-10-31T07:00:00Z',cancelled_at:null});return {data:'new',error:null}}
 if(name==='v113152_correct_payroll_deduction'){
  assert.equal(args.p_employee_id,'b');assert.equal(args.p_expected_amount,0);assert.equal(args.p_new_amount,300000)
  data.v113072_employee_cash_advances.find(r=>r.id==='new').remaining_amount-=300000
  data.v113072_cash_advance_deductions.push({id:'ded',employee_id:'b',cash_advance_id:'new',payroll_month:'2026-10-01',amount:300000,created_at:'2026-10-31T07:05:00Z'})
  return {data:{new_amount:300000},error:null}
 }
 throw Error('Unexpected mutation '+name)
}}
const bundle=await build({stdin:{contents:`export {PayrollPage} from './src/pages/PayrollPage'`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'esm',packages:'external',jsx:'automatic',plugins:[{name:'mock',setup(b){b.onResolve({filter:/lib\/supabase$|\.\/supabase$/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const supabase=globalThis.__mock'}))}}]})
const file='verification/.deduction-center-ui.mjs';await writeFile(file,bundle.outputFiles[0].text);const {PayrollPage}=await import('./.deduction-center-ui.mjs');const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');const {MemoryRouter}=await import('react-router-dom');const root=createRoot(document.getElementById('root'))
const click=async(label,container=document)=>{const b=[...container.querySelectorAll('button')].find(b=>b.textContent===label);assert.ok(b,label);await act(async()=>b.click())}
const input=async(selector,value)=>act(async()=>{const el=document.querySelector(selector);assert.ok(el,selector);Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));el.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
const row=name=>[...document.querySelectorAll('.payroll-table tbody tr')].find(r=>r.querySelector('td')?.textContent.includes(name))
await act(async()=>root.render(React.createElement(MemoryRouter,null,React.createElement(PayrollPage))));await input('input[type="month"]','2026-10');await click('Daftar Gaji')
for(const name of ['CECE','SANTOS','HARIS']){
 const r=row(name);assert.ok(r);assert.equal([...r.querySelectorAll('button')].filter(b=>b.textContent==='Potongan Kasbon').length,1,'one entry for every employee, including zero debt and zero salary')
 assert.ok(![...r.querySelectorAll('button')].some(b=>['Potong Kas Bon','Riwayat Potongan','Koreksi Potongan'].includes(b.textContent)),'no duplicate outside actions')
}
await click('Potongan Kasbon',row('SANTOS'));assert.match(document.body.textContent,/Tidak ada sisa utang kasbon/);assert.ok([...document.querySelectorAll('button')].find(b=>b.textContent==='Tambah Potongan Bulan 2026-10').disabled);await click('Tutup')
await click('Potongan Kasbon',row('HARIS'));assert.ok([...document.querySelectorAll('button')].find(b=>b.textContent==='Tambah Potongan Bulan 2026-10').disabled,'no salary cannot deduct');await click('Tutup')
// Record a new loan without any automatic payroll deduction, even if salary is available.
await click('Kas Bon',row('SANTOS'));assert.match(document.body.textContent,/tanpa memotong gaji/);await input('.modal-backdrop input[type=number]','500000');await click('Simpan Kas Bon')
assert.deepEqual(mutations.map(m=>m.name),['v113137_add_cash_advance']);assert.equal(data.v113072_cash_advance_deductions.length,0);assert.equal(debt('b'),500000)
await click('Potongan Kasbon',row('SANTOS'));await click('Tambah Potongan Bulan 2026-10');assert.equal(document.querySelector('input[aria-label="Nominal Tambahan Potongan"]').value,'','does not preselect maximum salary')
await input('input[aria-label="Nominal Tambahan Potongan"]','300000');await input('input[aria-label="Keterangan Potongan"]','Potongan disepakati Rp300.000')
assert.match(document.querySelector('[aria-label="Pratinjau koreksi"]').textContent.replace(/[\s\u00a0]/g,''),/Rp300.000.*Rp200.000.*Rp700.000/)
fail=true;await click('Simpan Tambahan Potongan');assert.match(document.body.textContent,/Koneksi putus/);assert.equal(debt('b'),500000)
fail=false;let release;held=new Promise(r=>release=r);const btn=[...document.querySelectorAll('button')].find(b=>b.textContent==='Simpan Tambahan Potongan');await act(async()=>{btn.click();btn.click()});assert.equal(mutations.length,3,'one loan, one failed deduction, one pending request for double tap');await act(async()=>{release();held=null})
assert.equal(debt('b'),200000);assert.equal(data.v113072_cash_advance_deductions[0].amount,300000);assert.ok(!mutations.some(m=>m.name==='v113072_apply_cash_advance_deduction'),'all explicit deductions use guarded, audited SQL081')
await act(async()=>root.unmount());await unlink(file)
console.log('PASS V153: single deduction center for all employees; zero debt/salary explained; duplicate actions removed; recording a loan never deducts salary; blank explicit amount; preview; guarded audited add; network retry and double-submit protection.')
