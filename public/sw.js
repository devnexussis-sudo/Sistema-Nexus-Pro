/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  NEXUS PRO — Service Worker v3.0 (Admin App)                ║
 * ║  Estratégia: Cache-First para assets, Network-First para API ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * FATAL-P1 Fix: SW reativado com estratégia de cache robusta.
 * Suporte a Push Notifications preparado.
 */

'use strict';

// ─── Versão do Cache ──────────────────────────────────────────
// Incrementar CACHE_VERSION força a substituição de todos os caches
// na próxima ativação do SW (deploy de nova versão).
const CACHE_VERSION = 'v3.0.0';
const CACHE_NAMES = {
    STATIC: `nexus-static-${CACHE_VERSION}`,   // HTML, JS, CSS (build artifacts)
    ASSETS: `nexus-assets-${CACHE_VERSION}`,   // Imagens, fontes, ícones
    API: `nexus-api-${CACHE_VERSION}`,       // Respostas de API (curta duração)
    OFFLINE: `nexus-offline-${CACHE_VERSION}`,  // Página offline fallback
};

// ─── Recursos para Pre-Cache (App Shell) ─────────────────────
// Estes recursos são cacheados no install para garantir funcionamento offline.
const APP_SHELL = [
    '/',
    '/index.html',
    '/manifest.json',
    '/favicon.svg',
    '/favicon.png',
    '/pwa-icon.png',
    '/nexus-logo.png',
];

// ─── Padrões de URL por Estratégia ───────────────────────────

/** Cache-First: assets estáticos que raramente mudam */
const CACHE_FIRST_PATTERNS = [
    /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?|ttf|eot)$/i,
    /fonts\.googleapis\.com/,
    /fonts\.gstatic\.com/,
    /cdn\.jsdelivr\.net/,
];

/** Network-First: API Supabase e dados dinâmicos */
const NETWORK_FIRST_PATTERNS = [
    // Supabase APIs removidas daqui para evitar stale tokens e conflitos de conexão
];

/** Stale-While-Revalidate: JS/CSS do build (Vite gera hashes únicos) */
const STALE_WHILE_REVALIDATE_PATTERNS = [
    /\/assets\//,
    /\.(?:js|css)$/i,
];

/** Nunca cachear: WebSockets, streams, analytics, localhost, Supabase Auth/API */
const NEVER_CACHE_PATTERNS = [
    /supabase\.co/,
    /functions\/v1\//,
    /rest\/v1\//,
    /auth\/v1\//,
    /realtime\/v1\//,
    /chrome-extension/,
    /sockjs/,
    /localhost/,
    /127\.0\.0\.1/,
    /192\.168\./,
];

// ─── Página Offline ───────────────────────────────────────────
const OFFLINE_PAGE = '/index.html'; // HashRouter serve tudo pelo index.html

// ─── Logger Interno ───────────────────────────────────────────
const DEBUG = false; // Mude para true para ver logs detalhados
const log = (msg, data = '') => DEBUG && console.log(`[SW] ${msg}`, data);
const error = (msg, err = '') => console.error(`[SW] ❌ ${msg}`, err);

// ─── INSTALL ─────────────────────────────────────────────────
self.addEventListener('install', (event) => {
    log(`🚀 Instalando Nexus Pro SW ${CACHE_VERSION}...`);

    event.waitUntil(
        caches.open(CACHE_NAMES.STATIC)
            .then((cache) => {
                log('📦 Pre-cacheando App Shell...');
                return cache.addAll(APP_SHELL);
            })
            .then(() => {
                log('✅ App Shell cacheado com sucesso.');
                return self.skipWaiting();
            })
            .catch((err) => {
                error('Erro no pre-cache:', err);
                return self.skipWaiting();
            })
    );
});

// ─── ACTIVATE ────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
    log(`⚡ Ativando Nexus Pro SW ${CACHE_VERSION}...`);

    event.waitUntil(
        Promise.all([
            // Remove caches de versões antigas
            caches.keys().then((cacheNames) => {
                const validCaches = Object.values(CACHE_NAMES);
                return Promise.all(
                    cacheNames
                        .filter((name) => !validCaches.includes(name))
                        .map((name) => {
                            log(`🗑️ Removendo cache antigo: ${name}`);
                            return caches.delete(name);
                        })
                );
            }),
            self.clients.claim(),
        ]).then(() => {
            log('✅ SW ativo e controlando todas as tabs.');
        })
    );
});

// ─── FETCH ───────────────────────────────────────────────────
// 🛡️ DEV MODE: Se o SW roda em localhost, NÃO intercepta NENHUM request.
// Isso evita que o cache do SW interfira no desenvolvimento.
const IS_DEV = self.location.hostname === 'localhost' ||
    self.location.hostname === '127.0.0.1' ||
    self.location.hostname.startsWith('192.168.');

self.addEventListener('fetch', (event) => {
    // Em dev, deixa o browser fazer o fetch normalmente (sem interceptação)
    if (IS_DEV) return;

    const { request } = event;
    const url = new URL(request.url);

    // Ignora requisições não-GET e padrões bloqueados
    if (request.method !== 'GET') return;
    if (NEVER_CACHE_PATTERNS.some((p) => p.test(request.url))) return;
    if (url.protocol === 'chrome-extension:') return;

    // Determina estratégia
    if (NETWORK_FIRST_PATTERNS.some((p) => p.test(request.url))) {
        event.respondWith(networkFirst(request));
    } else if (CACHE_FIRST_PATTERNS.some((p) => p.test(request.url))) {
        event.respondWith(cacheFirst(request));
    } else if (STALE_WHILE_REVALIDATE_PATTERNS.some((p) => p.test(request.url))) {
        event.respondWith(staleWhileRevalidate(request));
    } else {
        // Default: Network-First com fallback para offline
        event.respondWith(networkFirstWithOfflineFallback(request));
    }
});

// ─── Estratégias de Cache ─────────────────────────────────────

/**
 * Cache-First: Retorna do cache se disponível.
 * Ideal para: imagens, fontes, ícones.
 */
async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAMES.ASSETS);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        return new Response('', { status: 408, statusText: 'Offline' });
    }
}

/**
 * Network-First: Tenta rede, cai para cache se offline.
 * Ideal para: API Supabase, dados dinâmicos.
 */
async function networkFirst(request) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(request, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (response.ok) {
            try {
                const cache = await caches.open(CACHE_NAMES.API);
                cache.put(request, response.clone());
            } catch { /* cache put failed, ignore */ }
        }
        return response;
    } catch {
        const cached = await caches.match(request);
        if (cached) {
            console.log(`[SW] 📦 Offline — servindo do cache: ${request.url}`);
            return cached;
        }
        return new Response(JSON.stringify({ error: 'offline', cached: false }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

/**
 * Stale-While-Revalidate: Retorna cache imediatamente e atualiza em background.
 * Ideal para: JS/CSS do build (Vite gera hashes únicos por versão).
 */
async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE_NAMES.STATIC);
    const cached = await cache.match(request);

    const fetchPromise = fetch(request).then((response) => {
        if (response.ok) {
            try { cache.put(request, response.clone()); } catch { /* ignore */ }
        }
        return response;
    }).catch(() => null);

    return cached || fetchPromise;
}

/**
 * Network-First com fallback para index.html (HashRouter SPA).
 * Garante que navegação offline sempre mostra o app.
 */
async function networkFirstWithOfflineFallback(request) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(request, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (response.ok) {
            try {
                const cache = await caches.open(CACHE_NAMES.STATIC);
                cache.put(request, response.clone());
            } catch { /* cache put failed, ignore */ }
        }
        return response;
    } catch {
        const cached = await caches.match(request);
        if (cached) return cached;

        // Fallback para SPA: retorna index.html para navegação offline
        const offlinePage = await caches.match(OFFLINE_PAGE);
        if (offlinePage) return offlinePage;

        return new Response('<h1>Nexus Pro — Sem conexão</h1>', {
            status: 503,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }
}

// ─── PUSH NOTIFICATIONS ───────────────────────────────────────
// Infraestrutura preparada para receber notificações push do servidor.

self.addEventListener('push', (event) => {
    if (!event.data) return;

    let payload;
    try {
        payload = event.data.json();
    } catch {
        payload = { title: 'Nexus Pro', body: event.data.text() };
    }

    const options = {
        body: payload.body || 'Nova notificação',
        icon: '/pwa-icon.png',
        badge: '/favicon.png',
        tag: payload.tag || 'nexus-notification',
        data: payload.data || {},
        actions: payload.actions || [],
        requireInteraction: payload.requireInteraction || false,
        vibrate: [200, 100, 200],
    };

    event.waitUntil(
        self.registration.showNotification(payload.title || 'Nexus Pro', options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const url = event.notification.data?.url || '/';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clients) => {
                // Foca em tab existente se disponível
                const existingClient = clients.find((c) => c.url.includes(self.location.origin));
                if (existingClient) {
                    existingClient.focus();
                    existingClient.navigate(url);
                } else {
                    self.clients.openWindow(url);
                }
            })
    );
});

// ─── BACKGROUND SYNC ─────────────────────────────────────────
// Sincroniza dados pendentes quando a conexão é restaurada.

self.addEventListener('sync', (event) => {
    console.log(`[SW] 🔄 Background Sync: ${event.tag}`);

    if (event.tag === 'nexus-sync-orders') {
        event.waitUntil(syncPendingOrders());
    }
});

async function syncPendingOrders() {
    try {
        const clients = await self.clients.matchAll();
        clients.forEach((client) => {
            client.postMessage({ type: 'BACKGROUND_SYNC', tag: 'nexus-sync-orders' });
        });
    } catch (err) {
        console.error('[SW] ❌ Erro no Background Sync:', err);
    }
}

// ─── MENSAGENS DO APP ─────────────────────────────────────────
self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data?.type === 'CACHE_INVALIDATE') {
        caches.delete(CACHE_NAMES.API).then(() => {
            console.log('[SW] 🗑️ Cache de API invalidado por solicitação do app.');
        });
    }
});

log(`✅ Nexus Pro Service Worker ${CACHE_VERSION} carregado.`);
