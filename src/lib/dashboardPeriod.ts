import {addBusinessDays,businessDateKey,businessDateTimeIso,businessPeriodStart} from './businessTime'

export const monthNames=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
export type DashboardPeriod='today'|'7d'|'month'|'3m'|'6m'|'12m'|'selected-month'

export function dashboardRange(period:DashboardPeriod,month:string,now=new Date()){
  if(period==='selected-month'){
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Bulan laporan tidak valid')
    const [year,m]=month.split('-').map(Number)
    const next=new Date(Date.UTC(year,m,1,12))
    const nextKey=`${next.getUTCFullYear()}-${String(next.getUTCMonth()+1).padStart(2,'0')}-01`
    return {start:new Date(businessDateTimeIso(`${month}-01`)),end:new Date(businessDateTimeIso(nextKey)),toKey:addBusinessDays(nextKey,-1),label:`${monthNames[m-1]} ${year}`}
  }
  const toKey=businessDateKey(now)
  return {start:businessPeriodStart(period,now),end:new Date(businessDateTimeIso(addBusinessDays(toKey,1))),toKey,label:''}
}
