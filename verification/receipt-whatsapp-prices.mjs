import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {readFile,writeFile,unlink} from 'node:fs/promises'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test/orders'})
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
const oid='old-order',items=[{order_id:oid,service_name:'Cuci <Setrika>',quantity:2.5,unit:'kg',price:8000,subtotal:20000},{order_id:oid,service_name:'Bedcover',quantity:1,unit:'pcs',price:30000,subtotal:30000}],charges=[{order_id:oid,charge_name:'Deep cleaning',amount:5000}]
const row={id:oid,order_no:'HL-261006-00141',customer_name:'Mamah Alghi',customer_phone:'08123456789',created_at:'2026-10-06T06:00:00Z',status:'ready',payment_status:'partial',subtotal:55000,discount:5000,total:50000,paid_amount:20000,due_at:null}
let dbFailure=false,showPrice=true,blocked=false,popup
const dataset={v100_order_items:items,v113099_order_extra_charges:charges,v100_services:[{id:'s1',name:'Cuci <Setrika>',category:'Kiloan',price:99000,is_active:true}],v109_users:[],v113_order_commissions:[],v113097_order_commission_members:[],v100_customers:[],v113_employee_commission_settings:[]}
globalThis.__mock={rpc:async()=>({data:[row],error:null}),from(table){let offset=0,end=99;const q={select(){return q},eq(){return q},in(){return q},order(){return q},range(a,b){offset=a;end=b;return q},maybeSingle(){return q},then(ok){return Promise.resolve({data:table==='v110_receipt_print_settings'?{show_item_price:showPrice}:(dataset[table]||[]).slice(offset,end+1),error:dbFailure&&table==='v100_order_items'?{message:'Rincian gagal dibaca'}:null}).then(ok)}};return q}}
window.open=()=>{
 if(blocked)return null
 const d=new JSDOM('<body></body>')
 popup={document:d.window.document,opener:window,closed:false,url:null,location:{replace(url){popup.url=url}},close(){popup.closed=true}}
 return popup
}
const result=await build({stdin:{contents:`export * from './src/lib/orderReceipt';export {OrdersPage} from './src/pages/OrdersPage'`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'esm',packages:'external',jsx:'automatic',plugins:[{name:'mocks',setup(b){b.onResolve({filter:/lib\/(auth|supabase)$|\.\/supabase$/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path.endsWith('auth')?`export const useAuth=()=>({profile:{id:'owner',role:'owner',full_name:'Owner'}})`:`export const supabase=globalThis.__mock`}))}}]})
const file='verification/.receipt-prices-test.mjs';await writeFile(file,result.outputFiles[0].text)
const mod=await import('./.receipt-prices-test.mjs')
const values={pelanggan:'Mamah Alghi',order:row.order_no,total:'Rp50.000',usaha:'HappyLaundry'}
const compact=s=>s.replace(/[\s\u00a0]/g,'')
const text=mod.composeReceiptWhatsApp('Halo {{pelanggan}}, order {{order}}.',values,items,charges,row)
assert.match(text,/Cuci <Setrika>/);assert.ok(compact(text).includes('2,5kg×Rp8.000=Rp20.000'));assert.ok(compact(text).includes('Sisa tagihan:Rp30.000'.replaceAll(' ','')))
assert.ok(compact(text).includes('Diskon:Rp5.000'));assert.ok(compact(text).includes('Deepcleaning:Rp5.000'))
assert.equal((text.match(/Rincian layanan:/g)||[]).length,1)
const templated=mod.composeReceiptWhatsApp('{{nama}} / {nama}\n{{rincian}}\n{{ringkasan}}\n{{sisa}}',values,items,charges,row)
assert.match(templated,/Mamah Alghi \/ Mamah Alghi/);assert.equal((templated.match(/Rincian layanan:/g)||[]).length,1);assert.doesNotMatch(templated,/\{\{/)
const html=mod.receiptItemsHtml(items)
assert.match(html,/Cuci &lt;Setrika&gt;/);assert.doesNotMatch(html,/<Setrika>/)
assert.ok(compact(html).includes('Rp8.000'));assert.ok(compact(html).includes('Rp20.000'))
assert.doesNotMatch(compact(mod.receiptItemsHtml(items,false)),/Rp8\.000/);assert.match(compact(mod.receiptItemsHtml(items,false)),/Rp20\.000/)
assert.match(mod.receiptItemsHtml([{service_name:'Gratis',quantity:1,unit:'pcs',price:0,subtotal:0}]),/Rp/)
await mod.openOrderReceiptWhatsApp(row,'Halo {nama}, order {order} siap. {total}')
assert.equal(popup.opener,null);const wa=new URL(popup.url);assert.equal(wa.hostname,'wa.me');assert.equal(wa.pathname,'/628123456789')
assert.ok(compact(wa.searchParams.get('text')).includes('Rp8.000'));assert.doesNotMatch(wa.searchParams.get('text'),/99\.000/,'master price is never substituted')
assert.match(wa.searchParams.get('text'),/https:\/\/example.test\/track\/HL-261006-00141/)
dbFailure=true;await assert.rejects(mod.openOrderReceiptWhatsApp(row,'Halo'),/Rincian gagal dibaca/);assert.equal(popup.closed,true);assert.equal(popup.url,null)
dbFailure=false;blocked=true;await assert.rejects(mod.openOrderReceiptWhatsApp(row,'Halo'),/pop-up/);blocked=false
// Actual OrdersPage print action opens a receipt using database item snapshots.
const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');const {MemoryRouter}=await import('react-router-dom')
const root=createRoot(document.getElementById('root'))
await act(async()=>root.render(React.createElement(MemoryRouter,null,React.createElement(mod.OrdersPage))))
await act(async()=>{await new Promise(r=>setTimeout(r,350))})
const print=()=>document.querySelector('button.order-reprint-button')
assert.ok(print())
await act(async()=>print().click());assert.ok(compact(popup.document.body.textContent).includes('2,5kg×Rp8.000'));assert.match(popup.document.body.textContent,/Deep cleaning/);assert.doesNotMatch(popup.document.body.textContent,/99\.000/)
showPrice=false;await act(async()=>print().click());assert.doesNotMatch(compact(popup.document.body.textContent),/Rp8\.000/);assert.match(compact(popup.document.body.textContent),/Rp20\.000/)
// V146: actual detail and reprint must read the same complete teams.
let revision=0
const mountAgain=async()=>{
 await act(async()=>root.render(React.createElement(MemoryRouter,{key:++revision},React.createElement(mod.OrdersPage))))
 await act(async()=>{await new Promise(r=>setTimeout(r,350))})
}
const detailValue=label=>[...document.querySelectorAll('.modal-backdrop span')].find(e=>e.textContent===label)?.parentElement.querySelector('b')?.textContent
const openDetail=async()=>act(async()=>document.querySelector('button[aria-label="Lihat Detail"]').click())
dataset.v109_users=[{id:'ch',full_name:'CHOMENG'},{id:'ce',full_name:'CECE ADI R'},{id:'s',full_name:'SANTOS'},{id:'r',full_name:'HAJI ROBET'}]
dataset.v113_order_commissions=[{order_id:oid,worker_id:'s',courier_id:'ce'}]
dataset.v113097_order_commission_members=[
 {order_id:oid,commission_type:'courier',employee_id:'ch',is_primary:false,share_percent:50,total_percent:20},
 {order_id:oid,commission_type:'courier',employee_id:'ce',is_primary:true,share_percent:50,total_percent:20},
 {order_id:oid,commission_type:'production',employee_id:'s',is_primary:true,share_percent:50,total_percent:20},
 {order_id:oid,commission_type:'production',employee_id:'r',is_primary:false,share_percent:50,total_percent:20}
]
await mountAgain();await act(async()=>print().click());const teamPrint=popup.document.body.textContent
await openDetail();assert.equal(detailValue('Kurir'),'CHOMENG + CECE ADI R');assert.equal(detailValue('Dikerjakan oleh'),'SANTOS + HAJI ROBET')
assert.match(teamPrint,/CHOMENG \+ CECE ADI R/);assert.match(teamPrint,/SANTOS \+ HAJI ROBET/)
dataset.v113097_order_commission_members=[]
await mountAgain();await openDetail();assert.equal(detailValue('Kurir'),'CECE ADI R');assert.equal(detailValue('Dikerjakan oleh'),'SANTOS')
dataset.v113_order_commissions=[]
await mountAgain();await openDetail();assert.equal(detailValue('Kurir'),'-');assert.equal(detailValue('Dikerjakan oleh'),'-')
await act(async()=>root.unmount());await unlink(file)
console.log('PASS V146: both full courier and production teams match between actual detail and printed note; legacy single-person fallback; unassigned order.')
console.log('PASS V145: saved prices vs changed master; decimal quantities; discounts/extra charges/partial payment; zero price; HTML escaping; old/new templates without duplicated details; WA draft/phone/tracking; blocked/error recovery; actual OrdersPage reprint and price visibility setting.')
