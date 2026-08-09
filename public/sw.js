const CACHE_NAME='happylaundry-v113-0-8';
const APP_SHELL=['/','/index.html','/manifest.webmanifest','/favicon.png','/icon-192.png','/icon-512.png','/logo-happylaundry.jpg'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);

  if(url.hostname.includes('supabase.co')||url.pathname.startsWith('/rest/')||url.pathname.startsWith('/auth/'))return;

  if(request.mode==='navigate'||url.pathname.endsWith('.js')||url.pathname.endsWith('.css')){
    event.respondWith(
      fetch(request,{cache:'no-store'})
        .then(response=>{
          if(response.ok&&url.origin===self.location.origin){
            const copy=response.clone();
            caches.open(CACHE_NAME).then(cache=>cache.put(request.mode==='navigate'?'/index.html':request,copy));
          }
          return response;
        })
        .catch(()=>request.mode==='navigate'?caches.match('/index.html'):caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached=>cached||fetch(request).then(response=>{
      if(response.ok&&url.origin===self.location.origin){
        const copy=response.clone();
        caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));
      }
      return response;
    }))
  );
});
