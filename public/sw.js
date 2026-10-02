// ============================================
// DUNO Nexus PWA — Service Worker (Minimal)
// Objetivo: Habilitar instalação PWA sem cache agressivo.
// O admin panel é sempre online-first (dados em tempo real do Supabase).
// ============================================

const CACHE_NAME = 'nexus-admin-shell-v1';

// Shell mínimo: apenas assets estáticos que habilitam o splash de loading
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/duno-icon.png',
  '/favicon.png',
  '/favicon.svg',
  '/nexus-logo.png',
];

// Install: Cache mínimo do shell
self.addEventListener('install', (event) => {
  console.log('[SW] ⚙️ Install');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_ASSETS).catch((err) => {
        console.warn('[SW] Shell caching falhou (não crítico):', err);
      });
    })
  );
  // Ativa imediatamente sem esperar as tabs antigas fecharem
  self.skipWaiting();
});

// Activate: Limpa caches antigos
self.addEventListener('activate', (event) => {
  console.log('[SW] ✅ Activate');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    })
  );
  // Toma controle de todas as tabs abertas
  self.clients.claim();
});

// Fetch: Network-First strategy (admin panel precisa de dados em tempo real)
// Fallback para cache apenas para o shell (HTML/imagens estáticas)
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Ignora requests não-GET (POST, PUT, etc.)
  if (request.method !== 'GET') return;

  // Ignora requests para APIs externas (Supabase, Google Fonts CDN, etc.)
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Ignora requests de HMR/Vite em dev
  if (url.pathname.includes('__vite') || url.pathname.includes('@vite')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Atualiza o cache com a resposta mais recente (apenas shell assets)
        if (response.ok && SHELL_ASSETS.includes(url.pathname)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        // Offline: tenta servir do cache
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          // Se for navegação, retorna o index.html (SPA fallback)
          if (request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});
