import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {writeFile,unlink} from 'node:fs/promises'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/'});Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true})
const order=(id,date,total)=>({id,order_no:id,created_at:date,total,subtotal:total,paid_amount:0,status:'received',customer_name:id})
const orders=[order('oct-start','2026-09-30T17:00:00Z',100),order('oct-last','2026-10-31T16:59:59Z',200),order('nov-start','2026-10-31T17:00:00Z',900),order('sept-last','2026-09-30T16:59:59Z',800)]
const dates=[]
globalThis.__db={from(table){let offset=0,end=99;const q={select(){return q},eq(){return q},order(){return q},range(a,b){offset=a;end=b;return q},then(ok){const rows=table==='v100_orders_view'?orders:[];return Promise.resolve({data:rows.slice(offset,end+1),error:null,count:0}).then(ok)}};return q}}
const bundle=await build({stdin:{contents:`export {DashboardPage} from './src/pages/DashboardPage';export {dashboardRange} from './src/lib/dashboardPeriod';export {readDashboardPages} from './src/lib/dashboardPages'`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'esm',packages:'external',jsx:'automatic',plugins:[{name:'mock',setup(b){b.onResolve({filter:/lib\/supabase$|\.\/supabase$/},a=>({path:a.path,namespace:'db'}));b.onLoad({filter:/.*/,namespace:'db'},()=>({contents:'export const supabase=globalThis.__db'}));b.onResolve({filter:/lib\/auth$/},a=>({path:a.path,namespace:'auth'}));b.onLoad({filter:/.*/,namespace:'auth'},()=>({contents:`export const useAuth=()=>({profile:{role:'owner'}})`}));b.onResolve({filter:/lib\/financialSummary$/},a=>({path:a.path,namespace:'finance'}));b.onLoad({filter:/.*/,namespace:'finance'},()=>({contents:`export const fetchFinancialSummary=async(...args)=>{globalThis.__dates.push(args);return null}` }));b.onResolve({filter:/lib\/commissionLedger$/},a=>({path:a.path,namespace:'comm'}));b.onLoad({filter:/.*/,namespace:'comm'},()=>({contents:`export const loadCommissionLedger=async()=>({data:[],error:null})`}));}}]})
globalThis.__dates=dates
const file='verification/.dashboard-month-test.mjs';await writeFile(file,bundle.outputFiles[0].text)
const {DashboardPage,dashboardRange,readDashboardPages}=await import('./.dashboard-month-test.mjs')
const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');const {MemoryRouter}=await import('react-router-dom');const root=createRoot(document.getElementById('root'))
await act(async()=>root.render(React.createElement(MemoryRouter,null,React.createElement(DashboardPage))))
const choose=async(label,value)=>act(async()=>{const select=document.querySelector(`[aria-label="${label}"]`);Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set.call(select,value);select.dispatchEvent(new window.Event('change',{bubbles:true}))})
assert.equal(document.querySelector('[aria-label="Nama bulan"]').options.length,12)
await choose('Tahun laporan','2026');await choose('Nama bulan','10')
assert.match(document.querySelector('.dashboard-revenue-heading h3').textContent,/Oktober 2026/)
assert.deepEqual(dates.at(-1),['2026-10-01','2026-10-31'])
const chart=document.querySelector('.owner-combined-chart').textContent.replace(/[\s\u00a0]/g,'')
assert.match(chart,/Rp100/);assert.match(chart,/Rp200/);assert.doesNotMatch(chart,/Rp900|Rp800/)
await choose('Tahun laporan','2024');await choose('Nama bulan','02');assert.deepEqual(dates.at(-1),['2024-02-01','2024-02-29'])
await choose('Nama bulan','12');assert.deepEqual(dates.at(-1),['2024-12-01','2024-12-31'])
await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='7 Hari').click());assert.match(document.querySelector('.dashboard-revenue-heading h3').textContent,/7 Hari/)
const range=dashboardRange('selected-month','2026-10',new Date('2026-11-01T00:00:00Z'));assert.equal(range.start.toISOString(),'2026-09-30T17:00:00.000Z');assert.equal(range.end.toISOString(),'2026-10-31T17:00:00.000Z')
const rows=Array.from({length:1205},(_,id)=>({id}));let requests=0
let result=await readDashboardPages(()=>({range(a,b){requests++;return Promise.resolve({data:rows.slice(a,b+1),error:null})}}));assert.equal(result.data.length,1205);assert.equal(requests,13)
result=await readDashboardPages(()=>({range(a,b){return Promise.resolve(a?{data:null,error:{message:'network'}}:{data:rows.slice(a,b+1),error:null})}}));assert.equal(result.data,null);assert.equal(result.error.message,'network')
await act(async()=>root.unmount());await unlink(file)
console.log('PASS V157: actual Dashboard named-month/year controls, October WIB bounds exclude September/November, leap February and December finance range, quick presets preserved, full 1205-row pagination and failed-page withholding.')
