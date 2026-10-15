// UI regression checks with synthetic data; no production database access.
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {JSDOM} from 'jsdom'
import {writeFile,unlink} from 'node:fs/promises'
const fixture={employees:[{id:'a',name:'Robet',login_id:'robet'},{id:'b',name:'Haris',login_id:'haris'}],advances:[{id:'1',employee_id:'a',amount:600000,remaining_amount:400000,issued_at:'2026-01-01',note:'Kebutuhan keluarga'},{id:'2',employee_id:'a',amount:100000,remaining_amount:0,issued_at:'2026-02-01'},{id:'3',employee_id:'b',amount:300000,remaining_amount:300000,issued_at:'2026-03-01'}],deductions:[{id:'d1',employee_id:'a',cash_advance_id:'1',amount:200000,payroll_month:'2026-02-01',created_at:'2026-02-02'},{id:'d2',employee_id:'a',cash_advance_id:'2',amount:100000,payroll_month:'2026-03-01',created_at:'2026-03-02'}],corrections:[{id:'c1',employee_id:'a',cash_advance_id:'1',old_amount:500000,new_amount:600000,reason:'Koreksi nominal',corrected_at:'2026-02-03'}]}
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/finance/cash-advances'})
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true
dom.window.HTMLElement.prototype.scrollIntoView=function(){}
globalThis.__limits=[{employee_id:'a',salary_available:350000,outstanding:400000,excess:50000,payroll_month:'2026-10-01',approvals:[]},{employee_id:'b',salary_available:400000,outstanding:300000,excess:0,payroll_month:'2026-10-01',approvals:[]}];globalThis.__reportFixture=fixture;globalThis.__role='owner';globalThis.__exports=[]
const bundled=await build({entryPoints:['src/pages/CashAdvanceReportPage.tsx'],bundle:true,write:false,platform:'node',format:'esm',packages:'external',jsx:'automatic',plugins:[{name:'test-mocks',setup(b){b.onResolve({filter:/lib\/(auth|supabase|exportData)$/},args=>({path:args.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path.endsWith('auth')?'export const useAuth=()=>({profile:{role:globalThis.__role,employee_active:globalThis.__active!==false,permissions:{finance:globalThis.__finance===true}}})':args.path.endsWith('supabase')?'export const supabase={rpc:async(name)=>{if(globalThis.__rpcFailure)throw new Error("Connection failed");return {data:name==="v113137_cash_advance_limits"?globalThis.__limits:globalThis.__reportFixture,error:null}}}':'export const downloadXls=o=>globalThis.__exports.push(o); export const printPdf=o=>globalThis.__exports.push(o)'}))}}]})
await writeFile('verification/.report-test-bundle.mjs',bundled.outputFiles[0].text)
const {CashAdvanceReportPage}=await import('./.report-test-bundle.mjs')
const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');const {MemoryRouter}=await import('react-router-dom')
const root=createRoot(document.getElementById('root'))
const mount=async(url)=>{await act(async()=>{root.render(React.createElement(MemoryRouter,{key:url,initialEntries:[url]},React.createElement(CashAdvanceReportPage)))})}
const click=async(label)=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent===label);assert.ok(button,label+' exists');await act(async()=>button.click())}
await mount('/finance/cash-advances')
await click('Robet')
assert.match(document.body.textContent,/Riwayat Kasbon — Robet/);assert.match(document.body.textContent,/Kasbon melebihi gaji sebesar/)
assert.equal(document.querySelectorAll('section')[1].querySelectorAll('table')[0].querySelectorAll('tbody tr').length,2)
await click('Excel Karyawan');await click('Print Karyawan')
assert.equal(globalThis.__exports.length,2)
const report=globalThis.__exports[0]
assert.equal(report.summary[0][1],700000);assert.equal(report.summary[1][1],300000);assert.equal(report.summary[2][1],400000)
const events=report.rows.filter(r=>r[1]!=='Ringkasan kasbon')
assert.equal(events.reduce((s,r)=>s+r[2],0),400000,'corrected principal is not counted twice')
assert.ok(!report.rows.some(r=>r.includes('Haris')))
await click('Tutup Rincian');assert.doesNotMatch(document.body.textContent,/Riwayat Kasbon — Robet/)
await mount('/finance/cash-advances?employee=b');assert.match(document.body.textContent,/Riwayat Kasbon — Haris/)
await click('Excel');assert.equal(globalThis.__exports.at(-1).summary[2][1],700000,'global export stays global while detail open')
await mount('/finance/cash-advances?employee=missing');assert.match(document.body.textContent,/tidak memiliki kasbon/)
globalThis.__rpcFailure=true;await click('Refresh');assert.match(document.body.textContent,/Connection failed/);globalThis.__rpcFailure=false
globalThis.__role='employee';globalThis.__finance=true;await mount('/finance/cash-advances?employee=a');assert.match(document.body.textContent,/Riwayat Kasbon — Robet/)
await click('Print Karyawan');assert.equal(globalThis.__exports.at(-1).summary[2][1],400000)
await click('Tutup Rincian');await click('Haris');assert.match(document.body.textContent,/Riwayat Kasbon — Haris/)
await click('Excel Karyawan');assert.equal(globalThis.__exports.at(-1).summary[2][1],300000)
globalThis.__finance=false;await mount('/finance/cash-advances?employee=a');assert.match(document.body.textContent,/memerlukan akses Keuangan/)
globalThis.__finance=true;globalThis.__active=false;await mount('/finance/cash-advances?employee=b');assert.match(document.body.textContent,/memerlukan akses Keuangan/)
await act(async()=>root.unmount());await unlink('verification/.report-test-bundle.mjs')
console.log('PASS: employee click, deep link, close, totals, correction ledger, isolated detail export/print, global export, missing employee, network failure, finance staff access, revoked permission, inactive staff rejection.')
