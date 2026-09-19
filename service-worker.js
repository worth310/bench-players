const CACHE_NAME = 'bench-players-v1';
const APP_FILES = ['./','./index.html','./app.js','./styles.css','./roster.css','./goals.css','./theme.css','./formation.css','./polish.css','./manifest.json','./icon.svg'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => { if (event.request.method !== 'GET') return; event.respondWith(caches.match(event.request).then(saved => saved || fetch(event.request).then(response => { const copy=response.clone(); caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy)); return response; }).catch(() => caches.match('./index.html')))); });
