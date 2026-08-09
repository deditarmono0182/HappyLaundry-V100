const CODE39:Record<string,string>={
  '0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn','4':'nnnwwnnnw',
  '5':'wnnwwnnnn','6':'nnwwwnnnn','7':'nnnwnnwnw','8':'wnnwnnwnn','9':'nnwwnnwnn',
  'A':'wnnnnwnnw','B':'nnwnnwnnw','C':'wnwnnwnnn','D':'nnnnwwnnw','E':'wnnnwwnnn',
  'F':'nnwnwwnnn','G':'nnnnnwwnw','H':'wnnnnwwnn','I':'nnwnnwwnn','J':'nnnnwwwnn',
  'K':'wnnnnnnww','L':'nnwnnnnww','M':'wnwnnnnwn','N':'nnnnwnnww','O':'wnnnwnnwn',
  'P':'nnwnwnnwn','Q':'nnnnnnwww','R':'wnnnnnwwn','S':'nnwnnnwwn','T':'nnnnwnwwn',
  'U':'wwnnnnnnw','V':'nwwnnnnnw','W':'wwwnnnnnn','X':'nwnnwnnnw','Y':'wwnnwnnnn',
  'Z':'nwwnwnnnn','-':'nwnnnnwnw','.':'wwnnnnwnn',' ':'nwwnnnwnn','$':'nwnwnwnnn',
  '/':'nwnwnnnwn','+':'nwnnnwnwn','%':'nnnwnwnwn','*':'nwnnwnwnn'
}

export function code39Svg(value:string,height=56,narrow=2,wide=5){
  const clean=value.toUpperCase().replace(/[^0-9A-Z. $/+%-]/g,'')
  const encoded=`*${clean}*`
  let x=10
  const rects:string[]=[]
  for(const ch of encoded){
    const pattern=CODE39[ch]||CODE39['-']
    let bar=true
    for(const unit of pattern){
      const w=unit==='w'?wide:narrow
      if(bar)rects.push(`<rect x="${x}" y="0" width="${w}" height="${height}" fill="#111"/>`)
      x+=w
      bar=!bar
    }
    x+=narrow
  }
  const width=x+10
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Barcode ${clean}">${rects.join('')}</svg>`
}
