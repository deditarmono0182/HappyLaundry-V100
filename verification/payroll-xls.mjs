import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {writeFile,unlink} from 'node:fs/promises'
import {JSDOM} from 'jsdom'
const bundle=await build({stdin:{contents:`export {buildPayrollExport} from './src/lib/payrollExport';export {downloadXls} from './src/lib/exportData'`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',packages:'external'})
await writeFile('verification/.payroll-xls-test.mjs',bundle.outputFiles[0].text)
const {buildPayrollExport,downloadXls}=await import('./.payroll-xls-test.mjs')
const row={employee:{full_name:'Tri Dede'},presentDays:10,attendanceRate:100000,attendancePay:1000000,allowance:0,bonus:0,shareDetails:[],productionCommission:0,courierCommission:0,grossTotal:1000000,cashAdvanceApplied:0,cashAdvanceOutstanding:2000000,total:1000000,payrollBalance:-1000000,paidAmount:0,outstanding:1000000,paymentStatus:'unpaid'}
const second={...row,employee:{full_name:'Robet'},cashAdvanceApplied:200000,cashAdvanceOutstanding:300000,total:800000,payrollBalance:500000,paidAmount:400000,outstanding:400000,paymentStatus:'partial'}
const rows=[row,second],before=JSON.stringify(rows);const options=buildPayrollExport(rows,'2026-10',9000000)
const cell=(i,label)=>options.rows[i][options.headers.indexOf(label)]
assert.equal(cell(0,'Potongan Kas Bon Periode Ini'),0)
assert.equal(cell(0,'Sisa Kas Bon'),2000000)
assert.equal(cell(0,'Gaji Bersih (Potongan Tercatat)'),1000000)
assert.equal(cell(0,'Saldo Setelah Sisa Kas Bon (Simulasi)'),-1000000)
assert.equal(cell(0,'Status Saldo (Simulasi)'),'Saldo Minus')
assert.equal(cell(1,'Potongan Kas Bon Periode Ini'),200000)
assert.equal(cell(1,'Sisa Kas Bon'),300000)
assert.equal(cell(1,'Gaji Bersih (Potongan Tercatat)'),800000)
assert.equal(cell(1,'Saldo Setelah Sisa Kas Bon (Simulasi)'),500000)
assert.equal(cell(1,'Sisa Gaji Belum Dibayar'),400000)
assert.equal(options.summary.find(r=>r[0]==='Total Sisa Kas Bon')[1],2300000)
assert.equal(buildPayrollExport([second],'2026-10',0).summary.find(r=>r[0]==='Total Sisa Kas Bon')[1],300000,'filter uses only exported employees')
assert.ok(options.rows.every(r=>r.length===options.headers.length))
const empty=buildPayrollExport([],'2026-11',0);assert.equal(empty.rows.length,0);assert.equal(empty.summary.find(r=>r[0]==='Total Sisa Kas Bon')[1],0)
assert.equal(JSON.stringify(rows),before,'export does not change any debt, deduction or salary')
// Verify the actual Excel XML download contains the correct numeric cells.
const dom=new JSDOM('<body></body>');globalThis.document=dom.window.document
let blob;const create=URL.createObjectURL,revoke=URL.revokeObjectURL
URL.createObjectURL=b=>{blob=b;return 'blob:test'};URL.revokeObjectURL=()=>{}
dom.window.HTMLAnchorElement.prototype.click=function(){assert.equal(this.download,'gaji-karyawan-2026-10.xls')}
downloadXls(options)
const xml=new dom.window.DOMParser().parseFromString(await blob.text(),'text/xml')
assert.equal(xml.getElementsByTagName('parsererror').length,0)
const tableRows=[...xml.getElementsByTagName('Row')]
const findRow=name=>tableRows.find(r=>r.getElementsByTagName('Data')[0]?.textContent===name)
const tri=[...findRow('Tri Dede').getElementsByTagName('Data')]
for(const label of ['Potongan Kas Bon Periode Ini','Sisa Kas Bon','Gaji Bersih (Potongan Tercatat)','Saldo Setelah Sisa Kas Bon (Simulasi)']){
 const i=options.headers.indexOf(label);assert.equal(tri[i].textContent,String(options.rows[0][i]));assert.equal(tri[i].getAttribute('ss:Type'),'Number')
}
URL.createObjectURL=create;URL.revokeObjectURL=revoke
await unlink('verification/.payroll-xls-test.mjs')
console.log('PASS: real XLS numeric cells; debt with zero deduction; applied deduction; negative simulated balance; paid salary; filtered totals; empty export; no data mutation.')
