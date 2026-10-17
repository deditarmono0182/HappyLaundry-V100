export type CommissionRate={employee_id:string;production_percent:number;courier_percent:number}
export type CommissionMember={employee_id:string;commission_type:'production'|'courier';total_percent:number}
export function zeroCommissionWarnings(
  productionIds:string[],courierIds:string[],settings:CommissionRate[],
  employees:{id:string;full_name:string}[],members:CommissionMember[]=[]
){
  const warnings:string[]=[]
  for(const [kind,ids] of [['production',productionIds],['courier',courierIds]] as const){
    const selected=[...new Set(ids)].sort()
    if(!selected.length)continue
    const old=members.filter(m=>m.commission_type===kind)
    const same=old.length===selected.length&&old.every(m=>selected.includes(m.employee_id))
    // SQL team assignment uses array_agg(distinct uuid), whose first UUID is the rate reference.
    const zeroIds=same?old.filter(m=>Number(m.total_percent)===0).map(m=>m.employee_id)
      :Number(settings.find(s=>s.employee_id===selected[0])?.[kind==='production'?'production_percent':'courier_percent']||0)===0?[selected[0]]:[]
    if(zeroIds.length){
      const names=zeroIds.map(id=>employees.find(e=>e.id===id)?.full_name||'Karyawan').join(', ')
      warnings.push(`${kind==='production'?'Produksi':'Kurir'}: tarif ${same?'tersimpan':'acuan tim'} ${names} masih 0%. Komisi ${same?'penerima tersebut':'tim ini'} akan Rp0.`)
    }
  }
  return warnings
}
export function confirmZeroCommission(warnings:string[]){
  return !warnings.length||window.confirm(warnings.join('\n')+'\n\nLanjutkan dengan komisi 0%? Pilih Batal untuk memeriksa pengaturan komisi.')
}
