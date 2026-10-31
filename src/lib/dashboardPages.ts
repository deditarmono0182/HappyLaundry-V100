// Stable order must be supplied by the caller. Never return partial totals on failure.
export async function readDashboardPages(makeQuery:()=>any):Promise<{data:any[]|null;error:{message:string}|null}>{
  try{
    const data:any[]=[]
    for(let offset=0;;offset+=100){
      const result=await makeQuery().range(offset,offset+99)
      if(result.error)return {data:null,error:result.error}
      if(!Array.isArray(result.data))return {data:null,error:{message:'Gagal memuat seluruh data dashboard'}}
      data.push(...result.data)
      if(result.data.length<100)return {data,error:null}
    }
  }catch(error){return {data:null,error:{message:error instanceof Error?error.message:'Gagal memuat dashboard'}}}
}
