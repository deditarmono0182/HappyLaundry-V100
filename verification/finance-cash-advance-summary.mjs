import {build} from 'esbuild'
import {JSDOM} from 'jsdom'
import assert from 'node:assert/strict'
import {writeFile,unlink} from 'node:fs/promises'
const bundled=await build({entryPoints:['src/components/FinanceCashAdvanceSummary.tsx'],bundle:true,write:false,platform:'node',format:'esm',packages:'external',jsx:'automatic'})
await writeFile('verification/.summary-test-bundle.mjs',bundled.outputFiles[0].text)
const {FinanceCashAdvanceSummary}=await import('./.summary-test-bundle.mjs')
const dom=new JSDOM('<div id="root"></div>');globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root'))
const rows=[{employee_id:'tri',employee_name:'Tri Dede',amount:2200000,remaining_amount:2000000,paid_amount:200000,transaction_count:5,active_count:4},...Array.from({length:11},(_,i)=>({employee_id:String(i),employee_name:'Nama '+i,amount:100,remaining_amount:100,paid_amount:0,transaction_count:1,active_count:1}))]
let selected
await act(async()=>root.render(React.createElement(FinanceCashAdvanceSummary,{rows,onSelect:id=>selected=id})))
assert.equal(document.querySelectorAll('tbody tr').length,12,'all employees shown')
const first=document.querySelector('tbody tr');assert.match(first.textContent,/2.200.000/);assert.match(first.textContent,/2.000.000/);assert.match(first.textContent,/200.000/);assert.match(first.textContent,/5 catatan \(4 aktif\)/)
assert.match(document.querySelector('.finance-cash-advance-summary').textContent,/2.001.100/)
assert.match(document.querySelector('.finance-cash-advance-summary').textContent,/15/)
await act(async()=>first.querySelector('button').click());assert.equal(selected,'tri')
await act(async()=>root.render(React.createElement(FinanceCashAdvanceSummary,{rows:[],onSelect:()=>{}})));assert.match(document.body.textContent,/Belum ada kas bon/)
await act(async()=>root.unmount());await unlink('verification/.summary-test-bundle.mjs')
console.log('PASS: employee totals, repayment, balance, counts, >10 employees, selection routes to correct employee, empty state.')
