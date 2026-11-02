import {build} from 'esbuild'
import {writeFile,unlink} from 'node:fs/promises'
import assert from 'node:assert/strict'
const wait=()=>new Promise(r=>setTimeout(r,25));let active=0,max=0,calls=0
const b=await build({stdin:{contents:"export {readDashboardPages} from './src/lib/dashboardPages';export {managerSharesForRange} from './src/lib/managerShare';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',packages:'external',plugins:[{name:'db',setup(b){b.onResolve({filter:/supabase$/},a=>({path:a.path,namespace:'db'}));b.onLoad({filter:/.*/,namespace:'db'},()=>({contents:'export const supabase=globalThis.__db'}))}}]})
globalThis.__db={async rpc(name,args){calls++;active++;max=Math.max(max,active);await wait();active--;return {data:{payroll_month:args.p_month,rows:[]},error:null}}}
const f='verification/.parallel-period.mjs';await writeFile(f,b.outputFiles[0].text);const {readDashboardPages,managerSharesForRange}=await import('./.parallel-period.mjs')
const rows=Array.from({length:505},(_,id)=>({id}));let reads=0
const start=performance.now();const r=await readDashboardPages(()=>({async range(a,b){reads++;active++;max=Math.max(max,active);await wait();active--;return {data:rows.slice(a,b+1),error:null}}}));const elapsed=performance.now()-start
assert.deepEqual(r.data,rows);assert.equal(r.error,null);assert.equal(max,3);assert.equal(reads,7,'final wave may probe beyond end without duplicating results');assert.ok(elapsed<reads*25,'parallel waves reduce serial waits')
active=max=calls=0;const months=await managerSharesForRange('2024-01-15','2024-12-10');assert.equal(months.length,12);assert.equal(max,3);assert.equal(calls,12);assert.equal(months[1].ratio,1);assert.equal(months[0].ratio,17/31);assert.equal(months[11].ratio,10/31)
const failed=await readDashboardPages(()=>({async range(a,b){return a===100?{data:null,error:{message:'failed'}}:{data:rows.slice(a,b+1),error:null}}}));assert.equal(failed.data,null)
await unlink(f);console.log('PASS parallel period reads: 505 ordered rows without API truncation or duplication, max3 simultaneous pages, '+Math.round(elapsed)+'ms vs '+reads*25+'ms serial fixture; 12 manager months max3 concurrent with leap/partial-month ratios intact; failed necessary page withholds totals.')
