import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {writeFile,unlink} from 'node:fs/promises'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/payroll'})
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
const employee='robet'
const data={v109_users:[{id:employee,full_name:'HAJI ROBET',login_id:'robet',is_active:true}],v111_attendance:Array.from({length:24},(_,i)=>({id:String(i),employee_id:employee,attendance_date:`2026-10-${String(i+1).padStart(2,'0')}`,status:'present'})),v111_employee_payroll_settings:[{employee_id:employee,attendance_rate:10000,monthly_allowance:0}],v111_payroll_adjustments:[],v113_commission_ledger:[{employee_id:employee,order_id:'order1',order_no:'HL-1',commission_type:'production',amount:1488330,base_amount:7441650,percent:20,earned_at:'2026-10-03T00:00:00Z'}]}
let failSave=false,saves=0
const beforeAttendance=JSON.stringify(data.v111_attendance),beforeCommission=JSON.stringify(data.v113_commission_ledger)
globalThis.__mock={from(table){let payload;const q={select(){return q},eq(){return q},gte(){return q},lte(){return q},order(){return q},upsert(rows){payload=rows;return q},then(ok){if(payload){saves++;if(!failSave)data.v111_payroll_adjustments=payload.map(r=>({...r}));return Promise.resolve({error:failSave?{message:'Simpan bonus gagal'}:null}).then(ok)}return Promise.resolve({data:data[table]||[],error:null}).then(ok)}};return q}}
const bundle=await build({stdin:{contents:`export {PayrollPage} from './src/pages/PayrollPage'`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'esm',packages:'external',jsx:'automatic',plugins:[{name:'mock',setup(b){b.onResolve({filter:/lib\/supabase$|\.\/supabase$/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const supabase=globalThis.__mock'}))}}]})
const file='verification/.payroll-bonus-ui-test.mjs';await writeFile(file,bundle.outputFiles[0].text)
const {PayrollPage}=await import('./.payroll-bonus-ui-test.mjs');const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');const {MemoryRouter}=await import('react-router-dom')
const root=createRoot(document.getElementById('root'));let revision=0
const mount=async()=>act(async()=>root.render(React.createElement(MemoryRouter,{key:++revision},React.createElement(PayrollPage))))
const click=async(label)=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===label);assert.ok(b,label);await act(async()=>b.click())}
const setBonus=async(value)=>act(async()=>{const input=document.querySelector('input.payroll-bonus-input');Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));input.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
const detailValue=label=>[...document.querySelectorAll('.payroll-detail-summary>div')].find(d=>d.querySelector('span')?.textContent===label)?.querySelector('b')?.textContent.replace(/[\s\u00a0]/g,'')
const close=async()=>act(async()=>document.querySelector('.modal-backdrop button[aria-label="Tutup"]').click())
await mount();await click('Daftar Gaji');await setBonus('20000');await click('Detail')
assert.equal(detailValue('Bonus'),'Rp20.000');assert.equal(detailValue('Uang Kehadiran (24 hari)'),'Rp240.000');assert.equal(detailValue('Gaji Kotor'),'Rp1.748.330');assert.match(document.body.textContent,/Belum disimpan/)
await close();await click('Simpan Bonus');assert.equal(saves,1);assert.match(document.body.textContent,/Bonus bulanan berhasil disimpan/)
await click('Detail');assert.equal(detailValue('Bonus'),'Rp20.000');assert.doesNotMatch(document.body.textContent,/Belum disimpan/)
await mount();await click('Daftar Gaji');await click('Detail');assert.equal(detailValue('Bonus'),'Rp20.000');assert.equal(detailValue('Gaji Kotor'),'Rp1.748.330','saved bonus survives remount')
await close();await setBonus('30000');failSave=true;await click('Simpan Bonus');assert.match(document.body.textContent,/Simpan bonus gagal/)
await click('Detail');assert.equal(detailValue('Bonus'),'Rp30.000');assert.match(document.body.textContent,/Belum disimpan/,'failed save remains draft')
assert.equal(Number(data.v111_payroll_adjustments[0].bonus),20000,'failed save does not claim persisted amount')
assert.equal(JSON.stringify(data.v111_attendance),beforeAttendance);assert.equal(JSON.stringify(data.v113_commission_ledger),beforeCommission)
await act(async()=>root.unmount());await unlink(file)
console.log('PASS V149: actual payroll detail shows bonus and attendance pay; draft warning; save and remount persistence; salary totals include bonus; failed save stays draft; attendance and commissions unchanged.')
