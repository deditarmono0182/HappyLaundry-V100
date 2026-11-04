import {build} from 'esbuild'
import {readFile,mkdir} from 'node:fs/promises'
import {createServer} from 'node:http'
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
const require=createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/noop.js'),{chromium}=require('playwright')
const dir='/tmp/happy170-order-totals';await mkdir(dir,{recursive:true})
const ui=await readFile('verification/order-search-totals-ui.mjs','utf8'),stub=ui.slice(ui.indexOf('const oct='),ui.indexOf('window.open='))
const entry=`import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{OrdersPage}from'./src/pages/OrdersPage';import'./src/styles/global.css';import'./src/styles/regularReports.css';import'./src/styles/professional.css';document.documentElement.dataset.ui='professional';document.documentElement.dataset.density='compact';createRoot(document.getElementById('root')).render(<MemoryRouter><div className="app-shell"><main className="main-content"><div className="page-container"><OrdersPage/></div></main></div></MemoryRouter>);`
await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,outfile:dir+'/app.js',jsx:'automatic',plugins:[{name:'mock',setup(b){b.onResolve({filter:/supabase$/},()=>({path:'db',namespace:'mock'}));b.onResolve({filter:/lib\/auth$/},()=>({path:'auth',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='db'?stub+'export const supabase=globalThis.__db':"export const useAuth=()=>({profile:{id:'owner',role:'owner'}})"}))}}]})
const server=createServer(async(req,res)=>{const f=req.url?.split('?')[0],name=f==='/app.js'?'app.js':f==='/app.css'?'app.css':null;res.setHeader('Content-Type',name?.endsWith('.js')?'text/javascript':name?'text/css':'text/html');res.end(name?await readFile(dir+'/'+name):'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>')});await new Promise(r=>server.listen(0,'127.0.0.1',r))
const browser=await chromium.launch({executablePath:'/tmp/happy159-unpacked-chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote'],env:{...process.env,LD_LIBRARY_PATH:'/tmp/happy159-browser-libs'}})
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 for(const width of [320,390,768,1366]){
  await page.setViewportSize({width,height:1000});await page.goto('http://127.0.0.1:'+server.address().port)
  await page.getByLabel('Tanggal masuk dari',{exact:true}).fill('2026-10-01');await page.getByLabel('Tanggal masuk sampai',{exact:true}).fill('2026-10-31');await page.getByLabel('Tanggal masuk sampai',{exact:true}).blur()
  await page.waitForFunction(()=>document.querySelector('.order-stats-grid .stat-card:last-child strong')?.textContent.includes('2.283.740'))
  assert.equal(await page.locator('tbody tr').count(),100);assert.equal(await page.locator('.order-stats-grid strong').first().innerText(),'387')
  await page.waitForTimeout(650);await page.screenshot({path:dir+'/orders-'+width+'.png',fullPage:width>700})
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page overflow '+width)
  await page.getByRole('button',{name:'Muat 100 Order Lagi',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length===200);assert.match(await page.locator('.order-stats-grid .stat-card:last-child strong').innerText(),/2\.283\.740/)
  await page.getByLabel('Status Pembayaran',{exact:true}).selectOption('unpaid');await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length===33);assert.match(await page.locator('.order-stats-grid .stat-card:last-child strong').innerText(),/2\.283\.740/)
  const newPopup=page.waitForEvent('popup');await page.getByRole('button',{name:'PDF Filter',exact:true}).click();const popup=await newPopup;await popup.waitForFunction(()=>document.querySelectorAll('tbody tr').length===33);assert.match(await popup.locator('body').innerText(),/2283740/);assert.ok(await popup.getByRole('link',{name:/Kembali ke Aplikasi/}).count());await popup.close()
 }
 assert.deepEqual(errors,[]);console.log('PASS Orders browser 320/390/768/1366: full Rp2283740 total on initial 100 rows and after 200; all 33 unpaid fetched directly; full PDF filter matches amount/count, app return preserved; no page overflow or JS errors.')
}finally{await browser.close();await new Promise(r=>server.close(r))}
