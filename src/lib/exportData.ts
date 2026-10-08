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


export interface FinancialStatementSection{
  title:string
  rows:Array<[string,number|string]>
  total?:[string,number|string]
}

export interface FinancialStatementExportOptions{
  title:string
  filename:string
  subtitle:string
  businessName?:string
  summary:Array<[string,number|string]>
  sections:FinancialStatementSection[]
  resultRows:Array<[string,number|string]>
  notes?:string[]
}

const escapeXml=(value:ExportCell)=>
  String(value??'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&apos;')

const xmlCell=(value:number|string,style='Text')=>{
  const isNumber=typeof value==='number'&&Number.isFinite(value)
  return `<Cell ss:StyleID="${style}"><Data ss:Type="${isNumber?'Number':'String'}">${escapeXml(value)}</Data></Cell>`
}

export function downloadFinancialStatementXls(options:FinancialStatementExportOptions){
  const brand=options.businessName||'HappyLaundry Babakan'
  const summaryRows=options.summary.map(([label,value],index)=>{
    const valueStyle=typeof value==='number'?'CurrencySummary':'SummaryValue'
    return `<Row ss:Height="25">${xmlCell(label,'SummaryLabel')}${xmlCell(value,valueStyle)}</Row>`
  }).join('')

  const detailRows=options.sections.map(section=>{
    const rows=section.rows.map(([label,value])=>
      `<Row>${xmlCell(label,'DetailText')}${xmlCell(value,typeof value==='number'?'Currency':'Text')}</Row>`
    ).join('')
    const total=section.total
      ? `<Row ss:Height="23">${xmlCell(section.total[0],'SubtotalLabel')}${xmlCell(section.total[1],typeof section.total[1]==='number'?'SubtotalCurrency':'SubtotalValue')}</Row>`
      : ''
    return `<Row ss:Height="8"/><Row ss:Height="24"><Cell ss:StyleID="SectionTitle" ss:MergeAcross="1"><Data ss:Type="String">${escapeXml(section.title)}</Data></Cell></Row>${rows}${total}`
  }).join('')

  const finalRows=options.resultRows.map(([label,value],index)=>{
    const last=index===options.resultRows.length-1
    const labelStyle=last?'GrandTotalLabel':'ResultLabel'
    const valueStyle=last?(typeof value==='number'?'GrandTotalCurrency':'GrandTotalValue'):(typeof value==='number'?'ResultCurrency':'ResultValue')
    return `<Row ss:Height="${last?28:24}">${xmlCell(label,labelStyle)}${xmlCell(value,valueStyle)}</Row>`
  }).join('')

  const notes=(options.notes||[]).map(note=>
    `<Row><Cell ss:StyleID="Note" ss:MergeAcross="1"><Data ss:Type="String">${escapeXml(note)}</Data></Cell></Row>`
  ).join('')

  const detailSummary=options.summary.map(([label,value])=>
    `<Row>${xmlCell(label,'SummaryLabel')}${xmlCell(value,typeof value==='number'?'CurrencySummary':'SummaryValue')}</Row>`
  ).join('')

  const xml=`<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office"><Author>HappyLaundry Enterprise</Author><Title>${escapeXml(options.title)}</Title></DocumentProperties>
 <ExcelWorkbook xmlns="urn:schemas-microsoft-com:office:excel"><WindowHeight>12300</WindowHeight><WindowWidth>24000</WindowWidth><ProtectStructure>False</ProtectStructure><ProtectWindows>False</ProtectWindows></ExcelWorkbook>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="11"/><Interior/><NumberFormat/><Protection/></Style>
  <Style ss:ID="Title"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="18" ss:Bold="1" ss:Color="#173F5F"/></Style>
  <Style ss:ID="Brand"><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#1E88E5"/></Style>
  <Style ss:ID="Subtitle"><Font ss:FontName="Calibri" ss:Size="10" ss:Color="#5D7282"/></Style>
  <Style ss:ID="SummaryLabel"><Alignment ss:Vertical="Center"/><Font ss:Bold="1" ss:Color="#31546A"/><Interior ss:Color="#F4F9FC" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D7E5EE"/></Borders></Style>
  <Style ss:ID="SummaryValue"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Font ss:Bold="1" ss:Color="#173F5F"/><Interior ss:Color="#F4F9FC" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D7E5EE"/></Borders></Style>
  <Style ss:ID="CurrencySummary"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Font ss:Bold="1" ss:Size="12" ss:Color="#173F5F"/><Interior ss:Color="#F4F9FC" ss:Pattern="Solid"/><NumberFormat ss:Format="&quot;Rp&quot; #,##0"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D7E5EE"/></Borders></Style>
  <Style ss:ID="SectionTitle"><Alignment ss:Vertical="Center"/><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#2C7FB8" ss:Pattern="Solid"/></Style>
  <Style ss:ID="DetailText"><Alignment ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E7EEF3"/></Borders></Style>
  <Style ss:ID="Text"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E7EEF3"/></Borders></Style>
  <Style ss:ID="Currency"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><NumberFormat ss:Format="&quot;Rp&quot; #,##0"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E7EEF3"/></Borders></Style>
  <Style ss:ID="SubtotalLabel"><Font ss:Bold="1" ss:Color="#294A60"/><Interior ss:Color="#EAF4FB" ss:Pattern="Solid"/><Borders><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B9D6E8"/></Borders></Style>
  <Style ss:ID="SubtotalValue"><Alignment ss:Horizontal="Right"/><Font ss:Bold="1"/><Interior ss:Color="#EAF4FB" ss:Pattern="Solid"/><Borders><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B9D6E8"/></Borders></Style>
  <Style ss:ID="SubtotalCurrency"><Alignment ss:Horizontal="Right"/><Font ss:Bold="1"/><Interior ss:Color="#EAF4FB" ss:Pattern="Solid"/><NumberFormat ss:Format="&quot;Rp&quot; #,##0"/><Borders><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B9D6E8"/></Borders></Style>
  <Style ss:ID="ResultLabel"><Font ss:Bold="1" ss:Color="#38596D"/><Interior ss:Color="#F7FAFC" ss:Pattern="Solid"/></Style>
  <Style ss:ID="ResultValue"><Alignment ss:Horizontal="Right"/><Font ss:Bold="1"/><Interior ss:Color="#F7FAFC" ss:Pattern="Solid"/></Style>
  <Style ss:ID="ResultCurrency"><Alignment ss:Horizontal="Right"/><Font ss:Bold="1"/><Interior ss:Color="#F7FAFC" ss:Pattern="Solid"/><NumberFormat ss:Format="&quot;Rp&quot; #,##0"/></Style>
  <Style ss:ID="GrandTotalLabel"><Font ss:Bold="1" ss:Size="12" ss:Color="#0B684A"/><Interior ss:Color="#E6F7EF" ss:Pattern="Solid"/><Borders><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#8ACAAE"/></Borders></Style>
  <Style ss:ID="GrandTotalValue"><Alignment ss:Horizontal="Right"/><Font ss:Bold="1" ss:Size="12" ss:Color="#0B684A"/><Interior ss:Color="#E6F7EF" ss:Pattern="Solid"/><Borders><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#8ACAAE"/></Borders></Style>
  <Style ss:ID="GrandTotalCurrency"><Alignment ss:Horizontal="Right"/><Font ss:Bold="1" ss:Size="12" ss:Color="#0B684A"/><Interior ss:Color="#E6F7EF" ss:Pattern="Solid"/><NumberFormat ss:Format="&quot;Rp&quot; #,##0"/><Borders><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#8ACAAE"/></Borders></Style>
  <Style ss:ID="Note"><Font ss:Italic="1" ss:Size="9" ss:Color="#718491"/><Alignment ss:WrapText="1"/></Style>
 </Styles>
 <Worksheet ss:Name="Ringkasan Laba Rugi">
  <Table ss:ExpandedColumnCount="2">
   <Column ss:Width="245"/><Column ss:Width="155"/>
   <Row ss:Height="30"><Cell ss:StyleID="Title" ss:MergeAcross="1"><Data ss:Type="String">${escapeXml(options.title)}</Data></Cell></Row>
   <Row><Cell ss:StyleID="Brand" ss:MergeAcross="1"><Data ss:Type="String">${escapeXml(brand)}</Data></Cell></Row>
   <Row><Cell ss:StyleID="Subtitle" ss:MergeAcross="1"><Data ss:Type="String">${escapeXml(options.subtitle)}</Data></Cell></Row>
   <Row ss:Height="10"/>
   ${summaryRows}
   <Row ss:Height="10"/>
   ${finalRows}
   <Row ss:Height="10"/>
   ${notes}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><Selected/><FreezePanes/><FrozenNoSplit/><SplitHorizontal>4</SplitHorizontal><TopRowBottomPane>4</TopRowBottomPane><ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios></WorksheetOptions>
 </Worksheet>
 <Worksheet ss:Name="Rincian">
  <Table ss:ExpandedColumnCount="2">
   <Column ss:Width="245"/><Column ss:Width="155"/>
   <Row ss:Height="28"><Cell ss:StyleID="Title" ss:MergeAcross="1"><Data ss:Type="String">Rincian ${escapeXml(options.title)}</Data></Cell></Row>
   <Row><Cell ss:StyleID="Subtitle" ss:MergeAcross="1"><Data ss:Type="String">${escapeXml(options.subtitle)}</Data></Cell></Row>
   ${detailSummary}
   ${detailRows}
   <Row ss:Height="10"/>
   ${finalRows}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>2</SplitHorizontal><TopRowBottomPane>2</TopRowBottomPane><ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios></WorksheetOptions>
 </Worksheet>
</Workbook>`

  const blob=new Blob(['\ufeff',xml],{type:'application/vnd.ms-excel;charset=utf-8'})
  const url=URL.createObjectURL(blob)
  const a=document.createElement('a')
  a.href=url
  a.download=`${safeName(options.filename)}.xls`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function printFinancialStatementPdf(options:FinancialStatementExportOptions){
  const w=window.open('','_blank','width=900,height=760')
  if(!w)return
  const brand=options.businessName||'HappyLaundry Babakan'
  const summary=options.summary.map(([label,value])=>
    `<div class="kpi"><span>${escapeHtml(label)}</span><b>${typeof value==='number'?'Rp '+Math.round(value).toLocaleString('id-ID'):escapeHtml(value)}</b></div>`
  ).join('')
  const sections=options.sections.map(section=>{
    const rows=section.rows.map(([label,value])=>
      `<tr><td>${escapeHtml(label)}</td><td>${typeof value==='number'?'Rp '+Math.round(value).toLocaleString('id-ID'):escapeHtml(value)}</td></tr>`
    ).join('')
    const total=section.total?`<tr class="subtotal"><td>${escapeHtml(section.total[0])}</td><td>${typeof section.total[1]==='number'?'Rp '+Math.round(section.total[1]).toLocaleString('id-ID'):escapeHtml(section.total[1])}</td></tr>`:''
    return `<section><h2>${escapeHtml(section.title)}</h2><table><tbody>${rows}${total}</tbody></table></section>`
  }).join('')
  const results=options.resultRows.map(([label,value],index)=>
    `<div class="result ${index===options.resultRows.length-1?'grand':''}"><span>${escapeHtml(label)}</span><b>${typeof value==='number'?'Rp '+Math.round(value).toLocaleString('id-ID'):escapeHtml(value)}</b></div>`
  ).join('')
  const notes=(options.notes||[]).map(note=>`<p class="note">${escapeHtml(note)}</p>`).join('')
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(options.title)}</title><style>
  @page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#17384d;margin:0;font-size:10px}
  header{display:flex;justify-content:space-between;gap:20px;align-items:flex-end;border-bottom:2px solid #2583bd;padding-bottom:10px;margin-bottom:12px}h1{font-size:21px;margin:0;color:#164f73}header p{margin:4px 0 0;color:#6c8290}.brand{text-align:right;color:#597383}.brand b{font-size:12px;color:#1d78b2}
  .summary{display:grid;grid-template-columns:repeat(2,1fr);gap:7px;margin-bottom:12px}.kpi{border:1px solid #d8e7ef;border-radius:7px;padding:8px;background:#f7fbfd;display:flex;justify-content:space-between;gap:10px}.kpi span{color:#647f90}.kpi b{font-size:11px;color:#164f73}
  section{break-inside:avoid;margin:0 0 10px}section h2{margin:0;padding:6px 8px;background:#2c7fb8;color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.3px}table{width:100%;border-collapse:collapse}td{padding:5px 8px;border-bottom:1px solid #e5edf2}td:last-child{text-align:right;font-variant-numeric:tabular-nums}.subtotal td{font-weight:bold;background:#eef6fb;border-top:1px solid #bcd8e8}
  .results{margin-top:10px;border:1px solid #d8e7ef}.result{display:flex;justify-content:space-between;padding:7px 9px;border-bottom:1px solid #e7eef2;font-weight:bold}.result.grand{background:#e8f7ef;color:#086d4b;font-size:12px;border-top:2px solid #90cdb1}.note{font-size:8.5px;color:#718691;margin:4px 0}.no-print{display:flex;justify-content:flex-end;margin-top:12px}.no-print button{border:0;border-radius:8px;background:#1e88e5;color:#fff;padding:9px 13px;font-weight:bold}@media print{.no-print{display:none}}
  </style></head><body><header><div><h1>${escapeHtml(options.title)}</h1><p>${escapeHtml(options.subtitle)}</p></div><div class="brand"><b>${escapeHtml(brand)}</b><br>Laporan Owner</div></header><div class="summary">${summary}</div>${sections}<div class="results">${results}</div>${notes}<div class="no-print"><button onclick="window.print()">Simpan / Cetak PDF</button></div></body></html>`
  w.document.write(html);w.document.close();w.focus();window.setTimeout(()=>w.print(),250)
}
