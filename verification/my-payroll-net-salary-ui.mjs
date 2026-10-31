import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {writeFile,unlink} from 'node:fs/promises'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/my-payroll'});globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
const base={employee:{id:'santos',full_name:'SANTOS',login_id:'SANTOS'},present_days:29,attendance_rate:10000,allowance:0,bonus:0,cash_advance_applied:1700000,cash_advance_outstanding:2400000,paid_amount:0}
const commissions=[{order_id:'p',order_no:'PROD',commission_type:'production',amount:1889675,earned_at:'2026-10-02T00:00:00Z'},{order_id:'c',order_no:'KURIR',commission_type:'courier',amount:112500,earned_at:'2026-10-02T00:00:00Z'}]
const calls=[]
globalThis.__mock={from(table){const q={select(){return q},eq(){return q},order(){return q},range(){return q},then(ok){return Promise.resolve({data:[],error:null}).then(ok)}};return q},async rpc(name,args){calls.push({name,args});if(name==='v113072_my_payroll_base')return {data:{...base},error:null};if(name==='v113072_my_commissions')return {data:commissions,error:null};if(name==='v113072_my_revenue_share')return {data:0,error:null};if(name==='v113151_my_manager_share')return {data:{percent:0,amount:0},error:null};throw Error('Unexpected mutation '+name)}}
const bundle=await build({stdin:{contents:`export {MyPayrollPage} from './src/pages/MyPayrollPage'`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'esm',packages:'external',jsx:'automatic',plugins:[{name:'mock',setup(b){b.onResolve({filter:/lib\/supabase$|\.\/supabase$/},a=>({path:a.path,namespace:'db'}));b.onLoad({filter:/.*/,namespace:'db'},()=>({contents:'export const supabase=globalThis.__mock'}));b.onResolve({filter:/lib\/auth$/},a=>({path:a.path,namespace:'auth'}));b.onLoad({filter:/.*/,namespace:'auth'},()=>({contents:`export const useAuth=()=>({profile:{role:'employee'}})`}))}}]})
const file='verification/.net-salary-ui.mjs';await writeFile(file,bundle.outputFiles[0].text);const {MyPayrollPage}=await import('./.net-salary-ui.mjs');const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');const {MemoryRouter}=await import('react-router-dom');const root=createRoot(document.getElementById('root'));let revision=0
const mount=()=>act(async()=>root.render(React.createElement(MemoryRouter,{key:++revision},React.createElement(MyPayrollPage))))
const norm=s=>s.replace(/[\s\u00a0]/g,'')
const card=label=>[...document.querySelectorAll('.my-payroll-stats article')].find(d=>d.querySelector('span')?.textContent===label)
const detail=label=>[...document.querySelectorAll('.my-payroll-grid>div')].find(d=>d.querySelector('span')?.textContent===label)?.querySelector('b')?.textContent
await mount();assert.equal(norm(card('Gaji Kotor').querySelector('strong').textContent),'Rp2.292.175');assert.equal(norm(card('Gaji Bersih').querySelector('strong').textContent),'Rp592.175')
assert.match(card('Gaji Bersih').textContent,/Belum Dibayar/);assert.equal(norm(detail('Sisa Gaji Belum Dibayar')),'Rp592.175');assert.equal(norm(detail('Sisa Utang Kasbon (Belum Dipotong)')),'Rp2.400.000')
assert.ok(!document.querySelector('.my-payroll-simulation').open);assert.match(norm(document.querySelector('.my-payroll-simulation').textContent),/-Rp1.807.825/,'hypothetical full-debt netting kept only in explicitly labeled collapsed simulation')
assert.doesNotMatch(document.querySelector('.my-payroll-stats').textContent,/Saldo Minus|1.807.825/)
base.paid_amount=100000;await mount();assert.match(card('Gaji Bersih').textContent,/Sebagian/);assert.equal(norm(detail('Sisa Gaji Belum Dibayar')),'Rp492.175')
base.paid_amount=592175;await mount();assert.match(card('Gaji Bersih').textContent,/Lunas/);assert.equal(norm(detail('Sisa Gaji Belum Dibayar')),'Rp0','large unpaid loan does not turn paid wages into minus')
base.paid_amount=0;base.cash_advance_applied=2292175;await mount();assert.equal(norm(card('Gaji Bersih').querySelector('strong').textContent),'Rp0');assert.match(card('Gaji Bersih').textContent,/Terpotong Kas Bon/)
base.cash_advance_applied=0;await mount();assert.equal(norm(card('Gaji Bersih').querySelector('strong').textContent),'Rp2.292.175','remaining debt alone never becomes payroll deduction')
assert.ok(calls.every(c=>['v113072_my_payroll_base','v113072_my_commissions','v113072_my_revenue_share','v113151_my_manager_share'].includes(c.name)),'display fix performs no writes')
await act(async()=>root.unmount());await unlink(file)
console.log('PASS V155: screenshot Santos gross2,292,175 - applied1,700,000 = net592,175; debt2.4m separate; negative1,807,825 only collapsed simulation; unpaid/partial/paid/fully deducted states; debt without deduction; read-only data flow.')
