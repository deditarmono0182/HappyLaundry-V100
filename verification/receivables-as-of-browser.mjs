import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {readFile,mkdir} from 'node:fs/promises'
import {createServer} from 'node:http'
import {createRequire} from 'node:module'
const require=createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/noop.js'),{chromium}=require('playwright')
const dir='/tmp/happy168-receivables-browser';await mkdir(dir,{recursive:true})
const ui=await readFile('verification/receivables-as-of-ui.mjs','utf8'),stub=ui.slice(ui.indexOf('const row='),ui.indexOf('const bundled='))
const entry=`import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ReceivablesPage}from'./src/pages/ReceivablesPage';import{DashboardPage}from'./src/pages/DashboardPage';import'./src/styles/global.css';import'./src/styles/regularReports.css';import'./src/styles/professional.css';
document.documentElement.dataset.ui='professional';document.documentElement.dataset.density='compact';
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/receivables']}><div className="app-shell"><main className="main-content"><div className="page-container">{location.search.includes('dashboard')?<DashboardPage/>:<ReceivablesPage/>}</div></main></div></MemoryRouter>);`
await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,outfile:dir+'/app.js',jsx:'automatic',plugins:[{name:'mocks',setup(b){
 b.onResolve({filter:/supabase$/},a=>({path:a.path,namespace:'db'}));b.onLoad({filter:/.*/,namespace:'db'},()=>({contents:stub+'export const supabase=globalThis.__db'}))
 b.onResolve({filter:/lib\/auth$/},a=>({path:a.path,namespace:'auth'}));b.onLoad({filter:/.*/,namespace:'auth'},()=>({contents:"export const useAuth=()=>({profile:{id:'owner',role:'owner'}})"}))
 b.onResolve({filter:/financialSummary$/},a=>({path:a.path,namespace:'financial'}));b.onLoad({filter:/.*/,namespace:'financial'},()=>({contents:`export const fetchFinancialSummary=async()=>Object.fromEntries(['revenue','cashIn','receivable','operating','attendancePay','allowance','bonus','revenueShare','productionCommission','courierCommission','managerShare','profitBeforeManager','employeeCost','operatingNet','reserveTotal','netAfterReserve','cashOperatingSurplus'].map(k=>[k,0]))`}))
}}]})
const server=createServer(async(req,res)=>{const f=req.url?.split('?')[0],name=f==='/app.js'?'app.js':f==='/app.css'?'app.css':null;res.setHeader('Content-Type',name?.endsWith('.js')?'text/javascript':name?'text/css':'text/html');res.end(name?await readFile(dir+'/'+name):'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>')})
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port
const browser=await chromium.launch({executablePath:'/tmp/happy159-unpacked-chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote'],env:{...process.env,LD_LIBRARY_PATH:'/tmp/happy159-browser-libs'}})
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 for(const width of [320,390,768,1366]){
  await page.setViewportSize({width,height:1000});await page.goto(origin);await page.getByTitle('Bayar',{exact:true}).waitFor()
  await page.getByLabel('Bulan laporan piutang').fill('2026-10');await page.getByText('Saldo piutang per akhir 31 Oktober 2026 (WIB).',{exact:true}).waitFor()
  await page.waitForFunction(()=>document.querySelector('.receivable-amount')?.textContent.includes('80'))
  const r=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth,controls:[...document.querySelectorAll('.receivable-period input,.receivable-period button,.page-heading button')].map(e=>{const r=e.getBoundingClientRect();return{text:e.textContent,x:r.x,right:r.right,height:r.height}}),values:[...document.querySelectorAll('.stat-card strong')].map(e=>({size:getComputedStyle(e).fontSize,weight:getComputedStyle(e).fontWeight}))}))
  assert.ok(r.scroll<=width+1,JSON.stringify(r));for(const c of r.controls){assert.ok(c.x>=-1&&c.right<=width+1,JSON.stringify(c));assert.ok(c.height>=40,JSON.stringify(c))}for(const v of r.values){assert.equal(v.size,'16px');assert.equal(v.weight,'400')}
  await page.waitForTimeout(650);await page.screenshot({path:dir+'/piutang-'+width+'.png',fullPage:true})
  const popupPromise=page.waitForEvent('popup');await page.getByRole('button',{name:'PDF',exact:true}).click();const popup=await popupPromise;await popup.waitForLoadState();assert.match(await popup.locator('body').innerText(),/31 Oktober 2026/);assert.match(await popup.locator('body').innerText(),/80/);assert.ok(await popup.getByRole('link',{name:/Kembali ke Aplikasi/}).count());await popup.close();assert.ok(await page.getByLabel('Piutang per tanggal').isVisible())
  await page.goto(origin+'/?dashboard');await page.getByRole('button',{name:'Pilih Bulan',exact:true}).click();await page.getByLabel('Tahun laporan',{exact:true}).selectOption('2026');await page.getByLabel('Nama bulan',{exact:true}).selectOption('10');await page.waitForFunction(()=>document.querySelector('.owner-receivable-period')?.textContent.includes('80'))
  assert.match(await page.locator('.owner-receivable-period').innerText(),/31 Oktober 2026/)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Dashboard overflow '+width)
  await page.waitForTimeout(650);await page.screenshot({path:dir+'/dashboard-'+width+'.png',fullPage:true})
 }
 assert.deepEqual(errors,[]);console.log('PASS 8 browser screens: Receivables + Dashboard at 320/390/768/1366; historical totals/date and PDF preview return preserved; all filter/header controls reachable, 16px normal-weight numbers, no page overflow or JS errors.')
}finally{await browser.close();await new Promise(r=>server.close(r))}
