import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

const SUPABASE_URL = 'https://esrwwaoirlhcptbxtlsu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzcnd3YW9pcmxoY3B0Ynh0bHN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MTAwOTksImV4cCI6MjA4NjA4NjA5OX0.HOzS5m8CBiZ1PVvYkePKp8Lu20dl4ymomPnxPQrBA5c';

// ─── 🛡️ MÚLTIPLAS TENTATIVAS PARA DRIBLAR O CGNAT / IPV6 DA CLARO ───
// A Claro prende requisições IPv6 até o timeout nativo do OkHttp (~75s!).
// Timeout de 5s + 3 retries força o Android a fechar o socket travado e
// abrir um novo — geralmente na 2ª tentativa já usa IPv4 e funciona.
const customReactNativeFetch = async (url: RequestInfo | URL, options?: RequestInit) => {
    let attempt = 0;
    const MAX_RETRIES = 3;       // 4 tentativas no total (0, 1, 2, 3)
    const MAX_TIMEOUT_MS = 5000; // 5s — abortamos rápido para forçar re-roteamento

    while (attempt <= MAX_RETRIES) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), MAX_TIMEOUT_MS);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal as any,
            });
            clearTimeout(timeoutId);
            return response;
        } catch (error: any) {
            clearTimeout(timeoutId);
            const isAbort = error?.name === 'AbortError';
            const label = isAbort ? `Timeout ${MAX_TIMEOUT_MS}ms` : error.message;

            if (attempt === MAX_RETRIES) {
                console.error(`[Rede] ⛔ Falha definitiva após ${MAX_RETRIES + 1} tentativas: ${String(url).substring(0, 80)} — ${label}`);
                throw error;
            }
            // Backoff curto: 400ms · 800ms · 1200ms — suficiente para fechar sockets e mudar rota
            const backoff = 400 * (attempt + 1);
            console.warn(`[Rede] ⚠️ Tentativa ${attempt + 1}/${MAX_RETRIES + 1} falhou (${label}). Novo backoff ${backoff}ms...`);
            await new Promise(res => setTimeout(res, backoff));
            attempt++;
        }
    }
    throw new Error('Network Fetch Failed after all retries');
};

// 🛡️ Mobile-Grade In-Process Mutex
const lockQueue: Record<string, Promise<unknown>> = {};

const processLock = async <R>(name: string, acquireTimeout: number, fn: () => Promise<R>): Promise<R> => {
    const previousOperation = lockQueue[name] || Promise.resolve();
    const timeoutMs = acquireTimeout > 0 ? acquireTimeout : 10000;
    let timeoutId: any;

    const currentOperation = (async () => {
        try {
            await Promise.race([
                previousOperation.catch(() => { }),
                new Promise((_, reject) => {
                    timeoutId = setTimeout(() => reject(new Error(`⚠️ Lock Timeout: ${name}`)), timeoutMs);
                })
            ]);
            return await fn();
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    })();

    lockQueue[name] = currentOperation.catch(() => { });
    return currentOperation as Promise<R>;
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        lock: processLock as any,
    },
    global: {
        fetch: customReactNativeFetch,
        // Headers extras para forçar IPv4 em gateways que respeitam esta hint
        headers: {
            'x-prefer-ipv4': 'true',
        }
    },
    realtime: {
        // Heartbeat de 15s evita que CGNAT da Claro/Vivo encerre a conexão WebSocket ociosa
        heartbeatIntervalMs: 15000,
        // Reconexão mais rápida após queda de sinal
        reconnectAfterMs: (tries: number) => Math.min(1000 * Math.pow(2, tries), 20000),
    }
});

// ─── 🛡️ Diagnóstico e Persistência Agressiva ───────────────────

supabase.auth.onAuthStateChange((event, session) => {
    console.log(`[Mobile Auth] 🔑 Evento: ${event}`);
    if (event === 'TOKEN_REFRESHED') {
        console.log('[Mobile Auth] ✨ Token renovado com sucesso!');
    }
    if (!session && event !== 'SIGNED_OUT') {
        console.warn('[Mobile Auth] 🚨 Sessão perdida ou falha no refresh!', { event });
    }
});

/**
 * 💓 AppState Heartbeat
 * Sincroniza a sessão sempre que o app volta para o foreground.
 */
AppState.addEventListener('change', async (nextAppState) => {
    if (nextAppState === 'active') {
        console.log('[Mobile Heartbeat] 💓 App voltou para o foreground. Validando sessão...');
        try {
            const { data: { session }, error } = await supabase.auth.getSession();
            if (error) {
                console.error('[Mobile Heartbeat] ❌ Erro ao validar sessão:', error);
                return;
            }
            if (!session) {
                console.warn('[Mobile Heartbeat] ⚠️ Sessão nula. Tentando refresh...');
                await supabase.auth.refreshSession();
            } else {
                console.log('[Mobile Heartbeat] ✅ Conexão íntegra.');
            }
        } catch (err) {
            console.error('[Mobile Heartbeat] 💥 Exceção fatal:', err);
        }
    }
});

export const BUCKET_NAME = 'nexus-files';
