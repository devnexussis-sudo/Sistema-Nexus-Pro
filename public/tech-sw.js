const CACHE_NAME = 'nexus-tech-v1';
const ASSETS_TO_CACHE = [
    '/tech.html',
    '/tech-manifest.json',
    '/pwa-icon.png',
    '/favicon.svg'
];

// Instalação: Cacheia arquivos essenciais do Tech App
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Nexus Tech SW] Cacheando assets principais');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Ativação: Limpa caches antigos e assume controle
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        })
    );
    self.clients.claim();
});

// Estratégia de Fetch: Network First com Fallback para Cache
self.addEventListener('fetch', (event) => {
    // Ignora requests para Supabase e outros serviços externos
    if (event.request.url.includes('supabase.co') ||
        event.request.url.includes('googleapis.com') ||
        event.request.url.includes('cdn.')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .catch(() => {
                return caches.match(event.request);
            })
    );
});
