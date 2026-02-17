// Service Worker desabilitado temporariamente para desenvolvimento
// Se você precisa de PWA, reative após a estabilização

self.addEventListener('install', function (event) {
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (cacheNames) {
            return Promise.all(
                cacheNames.map(function (cacheName) {
                    return caches.delete(cacheName);
                })
            );
        }).then(function () {
            return self.clients.claim();
        }).then(function () {
            return self.registration.unregister();
        })
    );
});

console.log('⚠️ Tech Service Worker desativado - modo desenvolvimento');
