export const BUSINESS_TIME_ZONE='Asia/Jakarta'
export const BUSINESS_UTC_OFFSET='+07:00'

const partsFormatter=new Intl.DateTimeFormat('en-US',{
  timeZone:BUSINESS_TIME_ZONE,
  year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
})

export type BusinessDateParts={year:number;month:number;day:number;hour:number;minute:number;second:number}

export function businessParts(value:Date|string|number=new Date()):BusinessDateParts{
  const date=value instanceof Date?value:new Date(value)
  const map:Record<string,string>={}
  for(const part of partsFormatter.formatToParts(date)){
    if(part.type!=='literal')map[part.type]=part.value
  }
  return{
    year:Number(map.year),month:Number(map.month),day:Number(map.day),
    hour:Number(map.hour),minute:Number(map.minute),second:Number(map.second)
  }
}

const pad=(value:number)=>String(value).padStart(2,'0')

export function businessDateKey(value:Date|string|number=new Date()){
  const p=businessParts(value)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

export function businessMonthKey(value:Date|string|number=new Date()){
  const p=businessParts(value)
  return `${p.year}-${pad(p.month)}`
}

export function businessDateTimeIso(dateKey:string,time='00:00:00'){
  return `${dateKey}T${time}${BUSINESS_UTC_OFFSET}`
}

export function businessDayStart(value:Date|string|number=new Date()){
  return new Date(businessDateTimeIso(businessDateKey(value)))
}

export function businessDayEnd(value:Date|string|number=new Date()){
  return new Date(businessDateTimeIso(businessDateKey(value),'23:59:59.999'))
}

export function addBusinessDays(dateKey:string,days:number){
  const base=new Date(`${dateKey}T12:00:00${BUSINESS_UTC_OFFSET}`)
  base.setUTCDate(base.getUTCDate()+days)
  return businessDateKey(base)
}

export function businessMonthStartKey(value:Date|string|number=new Date()){
  return `${businessMonthKey(value)}-01`
}

export function businessPeriodStart(period:'today'|'7d'|'month'|'3m'|'6m'|'12m',now:Date=new Date()){
  const today=businessDateKey(now)
  if(period==='today')return new Date(businessDateTimeIso(today))
  if(period==='7d')return new Date(businessDateTimeIso(addBusinessDays(today,-6)))
  const p=businessParts(now)
  const count=period==='month'?1:period==='3m'?3:period==='6m'?6:12
  const anchor=new Date(Date.UTC(p.year,p.month-1-(count-1),1,12,0,0))
  const y=anchor.getUTCFullYear(),m=anchor.getUTCMonth()+1
  return new Date(businessDateTimeIso(`${y}-${pad(m)}-01`))
}

export function businessDateLabel(value:Date|string|number=new Date(),options:Intl.DateTimeFormatOptions={}){
  const date=value instanceof Date?value:new Date(value)
  return new Intl.DateTimeFormat('id-ID',{timeZone:BUSINESS_TIME_ZONE,...options}).format(date)
}

export function businessDateTimeLabel(value:Date|string|number=new Date(),options:Intl.DateTimeFormatOptions={}){
  const date=value instanceof Date?value:new Date(value)
  return new Intl.DateTimeFormat('id-ID',{
    timeZone:BUSINESS_TIME_ZONE,
    dateStyle:'medium',timeStyle:'short',
    ...options
  }).format(date)
}

export function businessCutoffForSession(startedAt:number,hour=21,minute=0){
  const startKey=businessDateKey(startedAt)
  let cutoff=new Date(businessDateTimeIso(startKey,`${pad(hour)}:${pad(minute)}:00`))
  if(startedAt>=cutoff.getTime()){
    cutoff=new Date(businessDateTimeIso(addBusinessDays(startKey,1),`${pad(hour)}:${pad(minute)}:00`))
  }
  return cutoff.getTime()
}
