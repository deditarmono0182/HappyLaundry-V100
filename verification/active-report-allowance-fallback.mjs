import {build} from 'esbuild'
import {writeFile,unlink} from 'node:fs/promises'
import assert from 'node:assert/strict'
let denyUsers=false
const data={v111_employee_payroll_settings:[{employee_id:'a',attendance_rate:10000,monthly_allowance:200000},{employee_id:'old',attendance_rate:10000,monthly_allowance:10000}],v109_users:[{id:'a',is_active:true},{id:'old',is_active:false}]}
globalThis.__db={from(table){const q={select(){return q},gte(){return q},lte(){return q},lt(){return q},order(){return q},range(){return q},then(ok){return Promise.resolve({data:data[table]||[],error:table==='v109_users'&&denyUsers?{message:'Daftar aktif gagal'}:null}).then(ok)}};return q},async rpc(name){if(name==='v113151_manager_report')return {data:{rows:[]},error:null};return {data:null,error:{code:'PGRST202'}}}}
const b=await build({stdin:{contents:"export {fetchFinancialSummary} from './src/lib/financialSummary'",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'esm',packages:'external',plugins:[{name:'stub',setup(b){b.onResolve({filter:/supabase$/},()=>({path:'db',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const supabase=globalThis.__db'}))}}]})
const name='verification/.active-allowance-fallback.mjs';await writeFile(name,b.outputFiles[0].text)
try{
 const {fetchFinancialSummary}=await import('./.active-allowance-fallback.mjs')
 const nov=await fetchFinancialSummary('2026-11-01','2026-11-06');assert.equal(nov.allowance,40000)
 assert.equal((await fetchFinancialSummary('2026-10-01','2026-10-31')).allowance,210000)
 assert.ok(Math.abs((await fetchFinancialSummary('2026-10-31','2026-11-06')).allowance-(210000/31+40000))<1e-7)
 denyUsers=true;await assert.rejects(fetchFinancialSummary('2026-11-01','2026-11-06'),e=>e.message==='Daftar aktif gagal')
 assert.equal((await fetchFinancialSummary('2026-10-01','2026-10-31')).allowance,210000)
 console.log('PASS financial legacy fallback: active November only, proportional days, unchanged October, mixed period, active-roster failure cannot silently produce a partial allowance.')
}finally{await unlink(name)}
