'use strict';
// Bump this name whenever app shell files change. The app activates updates once its local archive is idle and locked.
const CACHE_PREFIX = `pizza-tracker-${encodeURIComponent(self.registration.scope)}-shell-`;
const CACHE = CACHE_PREFIX + 'v9';
// The host redirects index.html to the canonical root; cache only that root.
const FILES = ['./','./theme.css','./app.js','./vault.js','./history.enc.json','./pwa.js','./reports.js','./vendor/xlsx.full.min.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable.png','./icons/apple-touch-icon.png'];
const urls = new Set(FILES.map(file=>new URL(file,self.registration.scope).href));
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  for(const url of urls){
    const response=await fetch(new Request(url,{cache:'reload'}));
    if(!response.ok||response.redirected)throw Error('Offline preparation failed');
    await cache.put(url,response);
  }
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const name of await caches.keys())if(name.startsWith(CACHE_PREFIX)&&name!==CACHE)await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('message',event=>{
  if(event.data?.type==='ACTIVATE_UPDATE')event.waitUntil(self.skipWaiting());
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  const root=new URL('./',self.registration.scope);
  const appNavigation=event.request.mode==='navigate'&&(url.pathname===root.pathname||url.pathname===root.pathname+'index.html');
  if(!appNavigation&&!urls.has(url.href))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const cached=await cache.match(appNavigation?root.href:event.request);
    return cached||fetch(event.request);
  })());
});
