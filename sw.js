/* Saibem — service worker
   Estratégias:
   - documento (navegação): rede primeiro, cai para o app shell em cache, depois para a página offline
   - imagens: cache primeiro (foto não muda), com teto de itens no cache de runtime
   - demais estáticos: stale-while-revalidate
*/
var VERSION = 'saibem-v1';
var SHELL = VERSION + '-shell';
var RUNTIME = VERSION + '-runtime';
var MAX_RUNTIME = 90;

/* app shell + as capas dos eventos em destaque (o resto entra sob demanda) */
var PRECACHE = [
  './',
  './index.html',
  './offline.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './img/p3.jpg',
  './img/p14.jpg',
  './img/p19.jpg',
  './img/p20.jpg',
  './img/p24.jpg'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(SHELL).then(function(c){
      return c.addAll(PRECACHE);
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){
        if (k !== SHELL && k !== RUNTIME) return caches.delete(k);
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

function trim(cacheName, max){
  caches.open(cacheName).then(function(c){
    c.keys().then(function(keys){
      if (keys.length > max) c.delete(keys[0]).then(function(){ trim(cacheName, max); });
    });
  });
}

self.addEventListener('fetch', function(e){
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  /* navegação → rede primeiro */
  if (req.mode === 'navigate'){
    e.respondWith(
      fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(SHELL).then(function(c){ c.put('./index.html', copy); });
        return res;
      }).catch(function(){
        return caches.match('./index.html').then(function(hit){
          return hit || caches.match('./offline.html');
        });
      })
    );
    return;
  }

  /* imagens → cache primeiro */
  if (req.destination === 'image'){
    e.respondWith(
      caches.match(req).then(function(hit){
        if (hit) return hit;
        return fetch(req).then(function(res){
          var copy = res.clone();
          caches.open(RUNTIME).then(function(c){
            c.put(req, copy); trim(RUNTIME, MAX_RUNTIME);
          });
          return res;
        }).catch(function(){ return caches.match('./icon-192.png'); });
      })
    );
    return;
  }

  /* demais → stale-while-revalidate */
  e.respondWith(
    caches.match(req).then(function(hit){
      var net = fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(RUNTIME).then(function(c){ c.put(req, copy); });
        return res;
      }).catch(function(){ return hit; });
      return hit || net;
    })
  );
});

/* permite à página pedir atualização imediata */
self.addEventListener('message', function(e){
  if (e.data === 'skip-waiting') self.skipWaiting();
});
