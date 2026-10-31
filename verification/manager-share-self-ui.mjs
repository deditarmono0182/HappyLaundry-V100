import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {writeFile,unlink} from 'node:fs/promises'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/my-payroll'})
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
let fail=false,hold=null
const calls=[]
globalThis.__mock={async rpc(name,args){calls.push({name,args});if(hold)await hold;
 if(name==='v113072_my_payroll_base')return {data:{employee:{id:'a',full_name:'Pengelola',login_id:'A'},present_days:1,attendance_rate:10000,allowance:20000,bonus:5000,cash_advance_applied:5000,cash_advance_outstanding:20000,paid_amount:10000},error:null}
 if(name==='v113072_my_commissions')return {data:[{order_id:'o',order_no:'HL1',commission_type:'production',amount:15000,percent:20,base_amount:75000,earned_at:'2026-10-03T00:00:00Z'}],error:null}
 if(name==='v113072_my_revenue_share')return {data:10000,error:null}
 if(name==='v113151_my_manager_share')return {data:fail?null:{percent:40,amount:40000},error:fail?{message:'SQL pengelola belum ada'}:null}
 throw Error(name)
}}
const bundle=await build({stdin:{contents:`export {MyPayrollPage} from './src/pages/MyPayrollPage'`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'esm',packages:'external',jsx:'automatic',plugins:[{name:'mock',setup(b){b.onResolve({filter:/lib\/supabase$|\.\/supabase$/},a=>({path:a.path,namespace:'db'}));b.onLoad({filter:/.*/,namespace:'db'},()=>({contents:'export const supabase=globalThis.__mock'}));b.onResolve({filter:/lib\/auth$/},a=>({path:a.path,namespace:'auth'}));b.onLoad({filter:/.*/,namespace:'auth'},()=>({contents:`export const useAuth=()=>({profile:{role:'employee'}})`}))}}]})
const file='verification/.manager-self-ui.mjs';await writeFile(file,bundle.outputFiles[0].text);const {MyPayrollPage}=await import('./.manager-self-ui.mjs');const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');const {MemoryRouter}=await import('react-router-dom');const root=createRoot(document.getElementById('root'))
await act(async()=>root.render(React.createElement(MemoryRouter,null,React.createElement(MyPayrollPage))))
const text=document.body.textContent.replace(/[\s\u00a0]/g,'')
assert.match(text,/BagiHasilPengelola\(40%\)Rp40.000/);assert.match(text,/GajiKotorRp100.000/);assert.match(text,/SisaRp85.000/)
assert.ok(calls.every(c=>!Object.keys(c.args).includes('p_employee')),'no employee selector in own share requests')
assert.ok(!calls.some(c=>c.name==='v113151_manager_report'),'private business profit never requested by Gaji Saya')
fail=true;await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Muat Ulang').click());assert.match(document.body.textContent,/SQL pengelola belum ada/);assert.equal(document.querySelector('.my-payroll-breakdown'),null,'failed share read does not silently show zero')
await act(async()=>root.unmount());await unlink(file)
console.log('PASS V151 Gaji Saya: own share % and amount, total salary, kasbon/payment balance; no global business-profit request; failed RPC cannot show false zero salary.')
