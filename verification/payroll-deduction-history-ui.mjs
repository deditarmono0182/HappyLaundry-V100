import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {writeFile,unlink} from 'node:fs/promises'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/payroll'});globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
const old1={id:'a',employee_id:'cece',cash_advance_id:'loanA',payroll_month:'2026-10-01',amount:2000000,created_at:'2026-10-02T02:00:00Z'},old2={id:'b',employee_id:'cece',cash_advance_id:'loanB',payroll_month:'2026-10-01',amount:62200,created_at:'2026-10-03T02:00:00Z'}
const current={...old1,amount:300000},sep={...old1,id:'sep',payroll_month:'2026-09-01',amount:75000,created_at:'2026-09-05T02:00:00Z'}
const dataset={v113072_cash_advance_deductions:[current,sep,...Array.from({length:100},(_,i)=>({...sep,id:'extra'+i,amount:10})),{...old1,id:'foreign',employee_id:'other',amount:999999}],v113152_deduction_corrections:[{id:'corr',employee_id:'cece',payroll_month:'2026-10-01',old_amount:2062200,new_amount:300000,new_remaining:4500000,reason:'Salah input potongan',created_at:'2026-10-31T07:00:00Z',before_details:{deductions:[old1,old2]},after_details:{deductions:[current]}}]}
let fail=false,ready=false;const calls=[]
globalThis.__mock={from(table){const filters=[];let start=0,end=999;const q={select(){return q},eq(k,v){filters.push([k,v]);return q},order(){return q},range(a,b){start=a;end=b;return q},then(ok){calls.push({table,start,end,filters});return Promise.resolve({data:(dataset[table]||[]).filter(r=>filters.every(([k,v])=>r[k]===v)).slice(start,end+1),error:fail&&table==='v113152_deduction_corrections'?{message:'SQL081 missing'}:null}).then(ok)}};return q}}
const bundle=await build({stdin:{contents:`export {PayrollDeductionHistory} from './src/components/PayrollDeductionHistory'`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'esm',packages:'external',jsx:'automatic',plugins:[{name:'mock',setup(b){b.onResolve({filter:/lib\/supabase$|\.\/supabase$/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const supabase=globalThis.__mock'}))}}]})
const file='verification/.deduction-history-ui.mjs';await writeFile(file,bundle.outputFiles[0].text);const {PayrollDeductionHistory}=await import('./.deduction-history-ui.mjs');const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root'));const onReady=v=>{ready=v}
await act(async()=>root.render(React.createElement(PayrollDeductionHistory,{employee:{id:'cece',full_name:'CECE ADI R'},month:'2026-10',onReady})))
assert.equal(ready,true)
let table=document.querySelector('.deduction-correction-history');assert.equal(table.querySelectorAll('tbody tr').length,2,'archived cancelled deduction remains visible')
const oldrow=[...table.querySelectorAll('tbody tr')].find(tr=>tr.textContent.replace(/[\s\u00a0]/g,'').includes('Rp62.200'));assert.ok(oldrow);assert.match(oldrow.textContent,/Dibatalkan melalui koreksi/);assert.match(oldrow.textContent,/Salah input potongan/)
assert.match(table.textContent.replace(/[\s\u00a0]/g,''),/Rp2.000.000Rp300.000/);assert.doesNotMatch(table.textContent,/999.999/)
await act(async()=>document.querySelector('input[type=checkbox]').click());assert.equal(document.querySelector('.deduction-correction-history').querySelectorAll('tbody tr').length,103);assert.ok(calls.some(c=>c.table==='v113072_cash_advance_deductions'&&c.start===100),'history paginates beyond 100 records')
assert.match(document.body.textContent.replace(/[\s\u00a0]/g,''),/TotalpotonganaktifRp376.000/)
let blob;const create=URL.createObjectURL,revoke=URL.revokeObjectURL;URL.createObjectURL=b=>{blob=b;return 'blob:history'};URL.revokeObjectURL=()=>{};dom.window.HTMLAnchorElement.prototype.click=function(){}
await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='XLS Riwayat').click())
const xml=new dom.window.DOMParser().parseFromString(await blob.text(),'text/xml');assert.equal(xml.getElementsByTagName('parsererror').length,0);assert.match(await blob.text(),/Dibatalkan melalui koreksi/);assert.match(await blob.text(),/376000/)
URL.createObjectURL=create;URL.revokeObjectURL=revoke
fail=true;await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Muat Ulang Riwayat').click());assert.equal(ready,false);assert.match(document.body.textContent,/SQL 081/);assert.ok(document.querySelector('.deduction-correction-history'),'original deductions remain readable if correction-history request fails');assert.ok([...document.querySelectorAll('button')].find(b=>b.textContent==='XLS Riwayat').disabled)
await act(async()=>root.unmount());await unlink(file)
console.log('PASS V152 history: original and corrected/cancelled entries retained; monthly/all-month filtering; no other employee data; >100 records pagination; current total excludes cancelled amounts; real XLS numeric total; missing audit SQL keeps original history visible and blocks incomplete export/correction.')
