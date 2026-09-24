const CACHE='tempera-v32';
const ASSETS=['./','index.html','tokens.css?v=32','interface.css?v=32','main.js?v=32','storage.js?v=32','content.js?v=32','exercises.js?v=32','books.js?v=32','quiz.js?v=32','manifest.webmanifest','assets/timo/timo-icon-05.svg','icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('tempera-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.open(CACHE).then(cache=>cache.match('index.html'))));return;}
 const path=new URL(event.request.url).pathname;
 // Libri e librerie pesanti: prima la copia salvata. Codice dell’app: prima la rete, così gli aggiornamenti arrivano subito; la copia serve solo offline.
 if(/\/(books|vendor|assets)\//.test(path)){event.respondWith(caches.open(CACHE).then(async cache=>{const cached=await cache.match(event.request);if(cached)return cached;const response=await fetch(event.request);if(response.ok)await cache.put(event.request,response.clone());return response;}));return;}
 event.respondWith(caches.open(CACHE).then(async cache=>{try{const response=await fetch(event.request,{cache:'no-cache'});if(response.ok)await cache.put(event.request,response.clone());return response;}catch(e){const cached=await cache.match(event.request);if(cached)return cached;throw e;}}));
});
