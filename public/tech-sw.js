/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  NEXUS TECH PRO — Service Worker v3.0 (Technician App)      ║
 * ║  Otimizado para campo: offline-first, sync inteligente       ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * FATAL-P1 Fix: SW reativado com estratégia offline-first para técnicos.
 * Prioridade: funcionar SEM internet em campo.
 */

'use strict';

const CACHE_VERSION = 'v3.0.0';
const CACHE_NAMES = {
    STATIC: `nexus-tech-static-${CACHE_VERSION}`,
    ASSETS: `nexus-tech-assets-${CACHE_VERSION}`,
    API: `nexus-tech-api-${CACHE_VERSION}`,
};

// App Shell do app técnico
const APP_SHELL = [
    '/tech.html',
    '/tech-manifest.json',
    '/favicon.svg',
    '/pwa-icon.png',
    '/nexus-logo.png',
];

// ─── Padrões de URL por Estratégia ───────────────────────────

const CACHE_FIRST_PATTERNS = [
    /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?|ttf|eot)$/i,
    /fonts\.googleapis\.com/,
    /fonts\.gstatic\.com/,
    /cdn\.jsdelivr\.net/,
];

const NETWORK_FIRST_PATTERNS = [
    /supabase\.co\/rest\/v1\//,
    /supabase\.co\/auth\/v1\//,
    /supabase\.co\/functions\/v1\//,
];

const NEVER_CACHE_PATTERNS = [
    /realtime\/v1\/websocket/,
    /chrome-extension/,
    /localhost/,
    /127\.0\.0\.1/,
    /192\.168\./,
];

// ─── INSTALL ─────────────────────────────────────────────────
self.addEventListener('install', (event) => {
    console.log(`[Tech-SW] 🚀 Instalando Nexus Tech SW ${CACHE_VERSION}...`);

    event.waitUntil(
        caches.open(CACHE_NAMES.STATIC)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => {
                console.log('[Tech-SW] ✅ App Shell cacheado.');
                return self.skipWaiting();
            })
            .catch((err) => {
                console.error('[Tech-SW] ❌ Erro no pre-cache:', err);
                return self.skipWaiting();
            })
    );
});

// ─── ACTIVATE ────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
    console.log(`[Tech-SW] ⚡ Ativando Nexus Tech SW ${CACHE_VERSION}...`);

    event.waitUntil(
        Promise.all([
            caches.keys().then((cacheNames) => {
                const validCaches = Object.values(CACHE_NAMES);
                return Promise.all(
                    cacheNames
                        .filter((name) => name.startsWith('nexus-tech-') && !validCaches.includes(name))
                        .map((name) => {
                            console.log(`[Tech-SW] 🗑️ Removendo cache antigo: ${name}`);
                            return caches.delete(name);
                        })
                );
            }),
            self.clients.claim(),
        ]).then(() => {
            console.log('[Tech-SW] ✅ Tech SW ativo.');
        })
    );
});

// ─── FETCH ───────────────────────────────────────────────────
const IS_DEV = self.location.hostname === 'localhost' ||
    self.location.hostname === '127.0.0.1' ||
    self.location.hostname.startsWith('192.168.');

self.addEventListener('fetch', (event) => {
    if (IS_DEV) return;

    const { request } = event;

    if (request.method !== 'GET') return;
    if (NEVER_CACHE_PATTERNS.some((p) => p.test(request.url))) return;
    if (new URL(request.url).protocol === 'chrome-extension:') return;

    if (NETWORK_FIRST_PATTERNS.some((p) => p.test(request.url))) {
        event.respondWith(networkFirst(request));
    } else if (CACHE_FIRST_PATTERNS.some((p) => p.test(request.url))) {
        event.respondWith(cacheFirst(request));
    } else {
        event.respondWith(networkFirstWithOfflineFallback(request));
    }
});

// ─── Estratégias ─────────────────────────────────────────────

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
        return new Response('', { status: 408 });
    }
}

async function networkFirst(request) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(request, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (response.ok) {
            try {
                const cache = await caches.open(CACHE_NAMES.API);
                cache.put(request, response.clone());
            } catch { /* ignore */ }
        }
        return response;
    } catch {
        const cached = await caches.match(request);
        if (cached) {
            console.log(`[Tech-SW] 📦 Offline — cache: ${request.url}`);
            return cached;
        }
        return new Response(JSON.stringify({ error: 'offline', cached: false }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

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
            } catch { /* ignore */ }
        }
        return response;
    } catch {
        const cached = await caches.match(request) || await caches.match('/tech.html');
        if (cached) return cached;

        return new Response('<h1>Nexus Tech — Sem conexão</h1><p>Seus dados estão salvos localmente.</p>', {
            status: 503,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }
}

// ─── PUSH NOTIFICATIONS ───────────────────────────────────────
self.addEventListener('push', (event) => {
    if (!event.data) return;

    let payload;
    try {
        payload = event.data.json();
    } catch {
        payload = { title: 'Nexus Tech', body: event.data.text() };
    }

    const options = {
        body: payload.body || 'Nova O.S. atribuída',
        icon: '/pwa-icon.png',
        badge: '/favicon.png',
        tag: payload.tag || 'nexus-tech-notification',
        data: payload.data || {},
        actions: [
            { action: 'view', title: '📋 Ver O.S.' },
            { action: 'dismiss', title: 'Fechar' },
        ],
        requireInteraction: true, // Técnicos precisam ver a notificação
        vibrate: [300, 100, 300, 100, 300],
    };

    event.waitUntil(
        self.registration.showNotification(payload.title || 'Nexus Tech Pro', options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const action = event.action;
    const data = event.notification.data;

    let targetUrl = '/tech.html';
    if (action === 'view' && data?.orderId) {
        targetUrl = `/tech.html#/order/${data.orderId}`;
    }

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clients) => {
                const techClient = clients.find((c) => c.url.includes('tech.html'));
                if (techClient) {
                    techClient.focus();
                    if (action === 'view') techClient.navigate(targetUrl);
                } else {
                    self.clients.openWindow(targetUrl);
                }
            })
    );
});

// ─── BACKGROUND SYNC ─────────────────────────────────────────
self.addEventListener('sync', (event) => {
    console.log(`[Tech-SW] 🔄 Background Sync: ${event.tag}`);

    if (event.tag === 'nexus-tech-sync') {
        event.waitUntil(notifyClientsToSync());
    }
});

async function notifyClientsToSync() {
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
        client.postMessage({ type: 'BACKGROUND_SYNC', tag: 'nexus-tech-sync' });
    });
}

// ─── MENSAGENS ────────────────────────────────────────────────
self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
    if (event.data?.type === 'CACHE_INVALIDATE') {
        caches.delete(CACHE_NAMES.API);
    }
});

console.log(`[Tech-SW] ✅ Nexus Tech Service Worker ${CACHE_VERSION} carregado.`);
