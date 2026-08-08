export type ExportCell=string|number|null|undefined
export type ExportRow=ExportCell[]

export interface ExportTableOptions{
  title:string
  filename:string
  headers:string[]
  rows:ExportRow[]
  subtitle?:string
  summary?:Array<[string,ExportCell]>
}

const escapeHtml=(value:ExportCell)=>
  String(value??'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')

const safeName=(value:string)=>
  value.toLowerCase()
    .replace(/[^a-z0-9_-]+/gi,'-')
    .replace(/^-+|-+$/g,'')
    || 'happylaundry-export'

export function downloadXls(options:ExportTableOptions){
  const summary=(options.summary||[])
    .map(([label,value])=>`<tr><td colspan="${Math.max(1,options.headers.length-1)}"><b>${escapeHtml(label)}</b></td><td><b>${escapeHtml(value)}</b></td></tr>`)
    .join('')

  const html=`<!doctype html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      table{border-collapse:collapse;font-family:Arial,sans-serif;font-size:11pt}
      th,td{border:1px solid #999;padding:6px 8px}
      th{background:#dceeff;font-weight:bold}
      h1{font-family:Arial,sans-serif;font-size:18pt}
      p{font-family:Arial,sans-serif}
      .summary td{background:#f4f8fb}
    </style>
  </head>
  <body>
    <h1>${escapeHtml(options.title)}</h1>
    ${options.subtitle?`<p>${escapeHtml(options.subtitle)}</p>`:''}
    <table>
      <thead><tr>${options.headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
      <tbody>
        ${options.rows.map(row=>`<tr>${row.map(cell=>`<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}
      </tbody>
      ${summary?`<tfoot class="summary">${summary}</tfoot>`:''}
    </table>
  </body>
  </html>`

  const blob=new Blob(['\ufeff',html],{type:'application/vnd.ms-excel;charset=utf-8'})
  const url=URL.createObjectURL(blob)
  const a=document.createElement('a')
  a.href=url
  a.download=`${safeName(options.filename)}.xls`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function printPdf(options:ExportTableOptions){
  const w=window.open('','_blank','width=1000,height=760')
  if(!w)return

  const summary=(options.summary||[])
    .map(([label,value])=>`<div><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`)
    .join('')

  const html=`<!doctype html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(options.title)}</title>
    <style>
      @page{size:A4 landscape;margin:12mm}
      *{box-sizing:border-box}
      body{font-family:Arial,sans-serif;color:#17384d;margin:0}
      header{display:flex;justify-content:space-between;gap:20px;align-items:end;border-bottom:2px solid #1e88e5;padding-bottom:10px;margin-bottom:14px}
      h1{font-size:22px;margin:0;color:#0f4774}
      header p{margin:5px 0 0;color:#60798b;font-size:11px}
      .brand{text-align:right;font-size:11px;color:#60798b}
      .summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:0 0 14px}
      .summary>div{border:1px solid #d4e5f1;border-radius:8px;padding:8px;background:#f8fbfd;display:grid;gap:3px}
      .summary span{font-size:9px;color:#6c8394}
      .summary b{font-size:12px;color:#164e76}
      table{width:100%;border-collapse:collapse;font-size:9px}
      th{background:#eaf4fb;color:#164e76;text-align:left;padding:7px;border:1px solid #cadae6}
      td{padding:7px;border:1px solid #dce7ee;vertical-align:top}
      tbody tr:nth-child(even){background:#fbfdfe}
      footer{margin-top:12px;font-size:8px;color:#7b8f9d;text-align:right}
      .no-print{margin:14px 0;display:flex;justify-content:flex-end}
      .no-print button{border:0;border-radius:8px;background:#1e88e5;color:#fff;padding:10px 14px;font-weight:bold}
      @media print{.no-print{display:none}}
    </style>
  </head>
  <body>
    <header>
      <div>
        <h1>${escapeHtml(options.title)}</h1>
        ${options.subtitle?`<p>${escapeHtml(options.subtitle)}</p>`:''}
      </div>
      <div class="brand"><b>HappyLaundry Enterprise</b><br>${new Date().toLocaleString('id-ID')}</div>
    </header>
    ${summary?`<section class="summary">${summary}</section>`:''}
    <table>
      <thead><tr>${options.headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
      <tbody>${options.rows.map(row=>`<tr>${row.map(cell=>`<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
    <footer>HappyLaundry Enterprise V110.9 • ${options.rows.length} baris data</footer>
    <div class="no-print"><button onclick="window.print()">Simpan / Cetak PDF</button></div>
  </body>
  </html>`

  w.document.write(html)
  w.document.close()
  w.focus()
  window.setTimeout(()=>w.print(),250)
}
