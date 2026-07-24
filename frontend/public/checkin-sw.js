const CACHE='race-checkin-v2';
const SHELL=['/checkin.webmanifest','/companion-icon.svg'];
const OFFLINE_PAGE='<!doctype html><meta name="viewport" content="width=device-width"><meta name="theme-color" content="#10151d"><style>html,body{margin:0;min-height:100%;background:#080b10;color:#f5f7fb;font:18px system-ui}main{box-sizing:border-box;min-height:100vh;display:grid;place-content:center;padding:28px;text-align:center}section{max-width:430px;padding:24px;background:#151a22;border:1px solid #d58610;border-radius:14px}p{color:#bac3cf;line-height:1.5}button{padding:14px 22px;border:0;border-radius:8px;background:#0879e8;color:white;font:700 1rem system-ui}</style><main><section><h1>Check-in roster is offline</h1><p>Reopen the saved Check-In app. If this screen remains, reconnect to the Race Assistant laptop and try again.</p><button onclick="location.reload()">Retry</button></section></main>';
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  const page=await fetch('/checkin/',{cache:'reload'});
  const html=await page.clone().text();
  await cache.put('/checkin/',page);
  const assets=[...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(match=>match[1]);
  await cache.addAll([...SHELL,...assets]);
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  await Promise.all((await caches.keys()).filter(key=>key.startsWith('race-checkin-')&&key!==CACHE).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.pathname.startsWith('/api/'))return;
  if(event.request.mode==='navigate'||url.pathname==='/checkin/'){
    const network=fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put('/checkin/',copy));return response});
    event.waitUntil(network.then(()=>undefined).catch(()=>undefined));
    event.respondWith(caches.match('/checkin/').then(cached=>cached||network).catch(()=>new Response(OFFLINE_PAGE,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response})));
});
