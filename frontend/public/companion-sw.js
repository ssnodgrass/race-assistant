const CACHE='race-companion-v5';
const SHELL=['/companion.webmanifest','/companion-icon.svg'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  const page=await fetch('/companion/',{cache:'reload'});
  const html=await page.clone().text();
  await cache.put('/companion/',page);
  const assets=[...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(match=>match[1]);
  await cache.addAll([...SHELL,...assets]);
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  await Promise.all((await caches.keys()).filter(key=>key!==CACHE).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.pathname.startsWith('/api/'))return;
  if(event.request.mode==='navigate'||url.pathname==='/companion/'){
    event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put('/companion/',copy));return response}).catch(()=>caches.match('/companion/')));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response})));
});
