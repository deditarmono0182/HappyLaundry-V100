// Keep the app's tab and state intact; always provide a route back from the report.
export function openReportWindow(){
  const preview=window.open('','_blank')
  if(!preview)window.alert('Pratinjau PDF belum terbuka. Izinkan pop-up/tab baru untuk HappyLaundry, lalu coba lagi.')
  return preview
}

export function showReportPreview(preview:Window,html:string){
  const returnUrl=window.location.href.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')
  const styles=`<meta name="viewport" content="width=device-width,initial-scale=1"><style>
    .report-preview-tools{position:sticky;top:0;z-index:100;display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:12px;background:#f2f8ff;border-bottom:1px solid #c7dfef;font:14px Arial,sans-serif;margin-bottom:16px}
    .report-preview-tools a,.report-preview-tools button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 14px;border:1px solid #b9d7ee;border-radius:10px;background:white;color:#185d8e;text-decoration:none;font:inherit;cursor:pointer}
    .report-preview-tools button{background:#1687e9;color:white;border-color:#1687e9}
    .report-preview-tools small{flex-basis:100%;font-size:12px;color:#537387}
    @media print{.report-preview-tools{display:none!important}}
  </style>`
  const toolbar=`<nav class="report-preview-tools" aria-label="Pratinjau PDF"><a id="report-return" href="${returnUrl}">← Kembali ke Aplikasi</a><button type="button" id="report-print">Simpan / Cetak PDF</button><small>Setelah menyimpan atau membatalkan cetak, pilih Kembali ke Aplikasi.</small></nav>`
  preview.document.write(html.replace('</head>',styles+'</head>').replace(/<body([^>]*)>/i,`<body$1>${toolbar}`))
  preview.document.close()
  preview.document.getElementById('report-print')?.addEventListener('click',()=>preview.print())
  preview.document.getElementById('report-return')?.addEventListener('click',event=>{
    try{
      if(preview.opener&&!preview.opener.closed){
        preview.opener.focus()
        preview.close()
        if(preview.closed)event.preventDefault()
      }
    }catch{/* The real link still returns to the app when iOS has detached the opener. */}
  })
  preview.focus()
}
