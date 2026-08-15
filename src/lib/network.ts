export async function withTimeout<T>(promise:PromiseLike<T>,ms=12000,label='Permintaan'):Promise<T>{
  let timer:number|undefined
  try{
    return await Promise.race([
      promise,
      new Promise<T>((_,reject)=>{timer=window.setTimeout(()=>reject(new Error(`${label} terlalu lama. Periksa koneksi lalu coba lagi.`)),ms)})
    ])
  }finally{if(timer)window.clearTimeout(timer)}
}

export async function retry<T>(fn:()=>Promise<T>,attempts=3,delayMs=700):Promise<T>{
  let last:unknown
  for(let i=0;i<attempts;i++){
    try{return await fn()}catch(error){
      last=error
      if(i<attempts-1)await new Promise(resolve=>window.setTimeout(resolve,delayMs*(i+1)))
    }
  }
  throw last instanceof Error?last:new Error('Koneksi gagal. Silakan coba lagi.')
}

export function friendlyNetworkError(error:unknown,fallback='Koneksi ke server gagal.') {
  const raw=error instanceof Error?error.message:String(error||'')
  if(/failed to fetch|network|load failed|fetch/i.test(raw))return `${fallback} Periksa internet lalu tekan Coba Lagi.`
  return raw||fallback
}
