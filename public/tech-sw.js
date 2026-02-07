const CACHE_NAME = 'nexus-tech-pro-v5-resilience';
const ASSETS_TO_CACHE = [
    '/tech.html',
    '/tech-manifest.json',
    '/pwa-icon.png',
    '/favicon.svg'
];

// Instalação: Force skip waiting
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Nexus SW] Pre-caching v5');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// Ativação: Limpeza agressiva de caches antigos
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((name) => {
                    if (name !== CACHE_NAME) {
                        console.log('[Nexus SW] Deletando cache antigo:', name);
                        return caches.delete(name);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: Especial para navegação (HTML) e assets
self.addEventListener('fetch', (event) => {
    // Não cacheia Supabase/API
    if (event.request.url.includes('supabase.co') ||
        event.request.url.includes('googleapis.com') ||
        event.request.method !== 'GET') {
        return;
    }

    // Estratégia: Network First com atualização de cache em background
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Se for um asset do próprio domínio, atualiza o cache
                if (response.ok && event.request.url.startsWith(self.location.origin)) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                }
                return response;
            })
            .catch(() => {
                // Offline fallback
                return caches.match(event.request);
            })
    );
});
