import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {writeFile,unlink} from 'node:fs/promises'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test/receivables'})
Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true})
const row=(id,total,paid,date='2026-10-20T12:00:00+07:00')=>({id,order_no:'HL-'+id,customer_id:'c',customer_name:'Pelanggan '+id,customer_phone:'08123',total,subtotal:total,paid_amount:paid,created_at:date,status:'received'})
const current=[row('sudah-lunas',100,100),row('november',50,0,'2026-11-02T12:00:00+07:00')]
let failure='',resolveSlow,slow=false;const calls=[],exports=[]
globalThis.__exports=exports
globalThis.__db={from(table){let lo=0,hi=99;const q={select(){return q},eq(){return q},in(){return q},order(){return q},range(a,b){lo=a;hi=b;return q},then(ok){const data=table==='v100_orders_view'?current:table==='v100_customers'?[{id:'c',address:'Babakan'}]:[];return Promise.resolve({data:data.slice(lo,hi+1),error:null,count:0}).then(ok)}};return q},async rpc(name,args){calls.push([name,args]);if(name!=='v113168_receivables_as_of')return{data:[],error:null};if(slow&&args.p_as_of==='2026-10-15')await new Promise(r=>resolveSlow=r);if(failure)return {error:{code:failure,message:'Gagal membaca piutang'}};const amount=args.p_as_of==='2026-10-31'?80:args.p_as_of==='2026-09-30'?30:10;return{data:{as_of:args.p_as_of,rows:[row('sudah-lunas',100,100-amount)],count:1,total:amount},error:null}}}
const bundled=await build({stdin:{contents:`export{ReceivablesPage}from'./src/pages/ReceivablesPage';export{DashboardPage}from'./src/pages/DashboardPage';export{loadReceivables,monthEndReceivable}from'./src/lib/receivables'`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'node',packages:'external',jsx:'automatic',plugins:[{name:'mock',setup(b){
 b.onResolve({filter:/supabase$/},a=>({path:a.path,namespace:'db'}));b.onLoad({filter:/.*/,namespace:'db'},()=>({contents:'export const supabase=globalThis.__db'}))
 b.onResolve({filter:/lib\/auth$/},a=>({path:a.path,namespace:'auth'}));b.onLoad({filter:/.*/,namespace:'auth'},()=>({contents:"export const useAuth=()=>({profile:{id:'owner',role:'owner'}})"}))
 b.onResolve({filter:/financialSummary$/},a=>({path:a.path,namespace:'financial'}));b.onLoad({filter:/.*/,namespace:'financial'},()=>({contents:`export const fetchFinancialSummary=async()=>Object.fromEntries(['revenue','cashIn','receivable','operating','attendancePay','allowance','bonus','revenueShare','productionCommission','courierCommission','managerShare','profitBeforeManager','employeeCost','operatingNet','reserveTotal','netAfterReserve','cashOperatingSurplus'].map(k=>[k,0]))`}))
 b.onResolve({filter:/lib\/exportData$/},a=>({path:a.path,namespace:'export'}));b.onLoad({filter:/.*/,namespace:'export'},()=>({contents:'export const downloadXls=o=>globalThis.__exports.push(o);export const printPdf=downloadXls'}))
}}]})
const file='verification/.receivables-ui.mjs';await writeFile(file,bundled.outputFiles[0].text)
const mod=await import('./.receivables-ui.mjs'),React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client'),{MemoryRouter,useLocation}=await import('react-router-dom')
const root=createRoot(document.getElementById('root'));let revision=0
function Screen({component}){const loc=useLocation();return React.createElement(React.Fragment,null,React.createElement('output',{'data-path':loc.pathname+loc.search}),React.createElement(component))}
const mount=async(component=mod.ReceivablesPage,path='/receivables')=>act(async()=>root.render(React.createElement(MemoryRouter,{key:++revision,initialEntries:[path]},React.createElement(Screen,{component}))))
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text)
const click=text=>act(async()=>{const b=button(text);assert.ok(b,text);assert.equal(b.disabled,false);b.click()})
const change=(selector,value)=>act(async()=>{const e=document.querySelector(selector),proto=e.tagName==='SELECT'?window.HTMLSelectElement.prototype:window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,value);e.dispatchEvent(new window.Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}))})
const value=()=>document.querySelector('.receivable-stats .stat-card strong').textContent
await mount();assert.match(value(),/50/);assert.equal(document.querySelectorAll('tbody tr').length,1);assert.ok(document.querySelector('[title=Bayar]'))
await change('[aria-label="Tampilan piutang"]','historical');await change('[type=month]','2026-10');assert.match(value(),/80/);assert.match(document.querySelector('tbody').textContent,/sudah-lunas/);assert.ok(!document.querySelector('[title=Bayar]'));assert.match(document.querySelector('output').dataset.path,/as_of=2026-10-31/)
await click('XLS');await click('PDF');for(const e of exports.slice(-2)){assert.match(e.subtitle,/31 Oktober 2026/);assert.equal(e.rows[0][4],20);assert.equal(e.rows[0][5],80);assert.equal(e.summary[1][1],80)}
await change('.search-box input','tidak ada');assert.match(value(),/0/);await click('XLS');assert.equal(exports.at(-1).rows.length,0);assert.equal(exports.at(-1).summary[1][1],0)
await change('.search-box input','');slow=true;await change('[type=date]','2026-10-15');assert.equal(button('XLS').disabled,true);assert.equal(value(),'—');await change('[type=date]','2026-10-31');assert.match(value(),/80/);await act(async()=>resolveSlow());assert.match(value(),/80/);slow=false
failure='PGRST202';await change('[type=date]','2026-09-30');assert.match(document.body.textContent,/SQL 088/);assert.equal(button('XLS').disabled,true);failure='';await click('Muat Ulang');assert.match(value(),/30/)
await click('Semua Bulan');assert.match(value(),/50/);assert.ok(!document.querySelector('output').dataset.path.includes('as_of'))
await mount(mod.ReceivablesPage,'/receivables?as_of=2026-10-31&view=historical');assert.match(value(),/80/)
// October order list uses TODAY'S balances: November settlement disappears, November orders excluded.
await mount(mod.ReceivablesPage,'/receivables?as_of=2026-10-31');assert.match(value(),/0/);assert.ok(!document.querySelector('tbody .receivable-amount'))
current.push(row('oct-cicilan',200,50),row('oct-belum',300,0))
await click('Muat Ulang');assert.match(value(),/450/);assert.equal(document.querySelectorAll('tbody tr').length,2);assert.match(document.querySelector('tbody').textContent,/Cicilan/);assert.match(document.querySelector('tbody').textContent,/Belum Bayar/);assert.ok(!document.querySelector('tbody').textContent.includes('november'))
await click('XLS');assert.equal(exports.at(-1).summary[1][1],450);assert.match(exports.at(-1).subtitle,/pembayaran terbaru|Pembayaran terbaru/);assert.equal(exports.at(-1).rows[0][6],'Cicilan')
current.find(r=>r.id==='oct-cicilan').paid_amount=200;await act(async()=>window.dispatchEvent(new window.Event('focus')));assert.match(value(),/300/);assert.equal(document.querySelectorAll('tbody tr').length,1)
current.find(r=>r.id==='oct-belum').paid_amount=300;await act(async()=>window.dispatchEvent(new window.Event('happylaundry-data-invalidated')));assert.match(value(),/0/);assert.ok(!document.querySelector('[title=Bayar]'));current.splice(2)

// Active list no longer truncates above 1000 rows.
const saved=current.slice();current.splice(0,current.length,...Array.from({length:1205},(_,i)=>row('bulk'+i,1,0)));assert.equal((await mod.loadReceivables(null)).length,1205);current.splice(0,current.length,...saved)
assert.equal(mod.monthEndReceivable('2024-02','2026-11-04'),'2024-02-29');assert.equal(mod.monthEndReceivable('2026-11','2026-11-04'),'2026-11-04')
await mount(mod.DashboardPage,'/');await click('Pilih Bulan');await change('[aria-label="Tahun laporan"]','2026');await change('[aria-label="Nama bulan"]','10');assert.match(document.querySelector('.owner-receivable-period').textContent,/31 Oktober 2026/);assert.match(document.querySelector('.owner-receivable-period strong').textContent,/80/)
await change('[aria-label="Nama bulan"]','09');assert.match(document.querySelector('.owner-receivable-period strong').textContent,/30/)
await change('[aria-label="Nama bulan"]','10');await act(async()=>document.querySelector('.owner-receivable-period').click());assert.equal(document.querySelector('output').dataset.path,'/receivables?as_of=2026-10-31&view=historical')
await act(async()=>root.unmount());await unlink(file)
console.log('PASS Receivables/Dashboard: month/date filters, exact matching totals/count/XLS/PDF, fully-paid-now historical debt, live actions retained, 1205 live rows, no stale response/export during switch, search/zero/retry/missing SQL, URL deep link, leap month and Dashboard date/amount/navigation.')
