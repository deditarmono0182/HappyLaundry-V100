import {supabase} from './supabase'

export type OrderCustomerAddress={id:string;address:string|null}
// Read customers attached to the displayed orders so old customers beyond the
// first page of the customer picker are still included.
export async function loadOrderCustomerAddresses(customerIds:string[]){
  const ids=[...new Set(customerIds.filter(Boolean))]
  const addresses:OrderCustomerAddress[]=[]
  for(let offset=0;offset<ids.length;offset+=50){
    const {data,error}=await supabase.from('v100_customers').select('id,address').in('id',ids.slice(offset,offset+50))
    if(error)throw new Error(`Alamat pelanggan gagal dimuat: ${error.message}`)
    addresses.push(...((data||[]) as OrderCustomerAddress[]))
  }
  return addresses
}
