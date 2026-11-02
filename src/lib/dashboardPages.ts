// Stable order must be supplied by the caller. Never return partial totals on failure.
export async function readDashboardPages(makeQuery:()=>any):Promise<{data:any[]|null;error:{message:string}|null}>{
  try{
    const data:any[]=[]
    for(let offset=0;;){
      // Probe first; then read three ordered pages concurrently, below the API row cap.
      const count=offset===0?1:3
      const batch=await Promise.all(Array.from({length:count},(_,i)=>makeQuery().range(offset+i*100,offset+i*100+99)))
      for(const result of batch){
        if(result.error)return {data:null,error:result.error}
        if(!Array.isArray(result.data))return {data:null,error:{message:'Gagal memuat seluruh data dashboard'}}
        data.push(...result.data)
        if(result.data.length<100)return {data,error:null}
      }
      offset+=count*100
    }
  }catch(error){return {data:null,error:{message:error instanceof Error?error.message:'Gagal memuat dashboard'}}}
}
