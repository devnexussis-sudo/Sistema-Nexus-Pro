
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    CLARO_FIX_FLAGS,
    getCarrierInfoSync,
    detectCarrier,
    classifyError,
} from './connection-diagnostics';

const SUPABASE_URL = 'https://esrwwaoirlhcptbxtlsu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzcnd3YW9pcmxoY3B0Ynh0bHN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MTAwOTksImV4cCI6MjA4NjA4NjA5OX0.HOzS5m8CBiZ1PVvYkePKp8Lu20dl4ymomPnxPQrBA5c';

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

// ─── 🌐 CLARO-AWARE Custom Fetch with CGNAT-Safe Timeouts ─────────────────
// 
// FIX PRINCIPAL: Timeouts corrigidos para Claro Brasil.
//
// ANTES (quebrava na Claro):
//   4.5s → 6s → 10s  (Claro CGNAT leva 6-8s para TLS handshake completo)
//
// DEPOIS (funciona em todas as operadoras):
//   8s → 12s → 18s   (dá tempo pro DNS AAAA + TCP SYN + TLS 1.3 + HTTP/2)
//
// REGRAS DE OURO (Section 0.1-0.4):
// ✅ Sempre usa https:// + hostname completo (nunca IP, nunca http)
// ✅ Nunca remove Host header (quebra SNI na Claro)
// ✅ Nunca força IPv4 (Supabase é IPv6-first, Claro tem IPv6)
// ✅ Nunca customiza DNS resolver no fetch
//
const customFetch = async (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
    const urlStr = typeof url === 'string' ? url : (url instanceof URL ? url.toString() : (url as unknown as Request).url || '');
    
    // Mídias (Storage uploads/downloads) não podem sofrer retrys agressivos se não corrompem ou duplicam banda.
    const isStorage = urlStr.includes('/storage/v1/');
    if (isStorage) {
        const TIME_OUT_MS = 120000; 
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIME_OUT_MS);
        try {
            return await fetch(url, { ...options, signal: controller.signal });
        } catch (e: any) {
            if (e.name === 'AbortError' || e.message === 'Aborted') throw new Error('Network request failed');
            throw e;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    // ─── Carrier-Aware Timeouts (Section 0.5 + 1.5) ─────────────────────
    // Claro CGNAT: 8s/12s/18s (mais tempo para DNS AAAA + TLS handshake)
    // Outras operadoras: 6s/8s/12s (margem normal mas nunca <5s)
    // REGRA: Nenhuma chamada <15s timeout total (Section 1.5 — somando os 3 retries = 38s Claro)
    const carrierInfo = getCarrierInfoSync();
    const isClaro = carrierInfo.isClaro || carrierInfo.carrier === 'unknown'; // Unknown = treat as Claro (worst case)
    
    const RETRIES = 3;
    const TIMEOUTS = CLARO_FIX_FLAGS.ENABLE_EXTENDED_TIMEOUTS
        ? (isClaro ? [8000, 12000, 18000] : [6000, 8000, 12000])
        : [4500, 6000, 10000]; // Fallback ao comportamento antigo se flag desligada
    
    for (let attempt = 0; attempt < RETRIES; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS[attempt]);
        const start = Date.now();
        
        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeoutId);
            
            // Log de sucesso em retry (Telemetria pra saber se estamos salvando o UX do técnico)
            if (attempt > 0) {
                const endpoint = urlStr.split('?')[0].split('/').pop();
                console.log(`[Supabase Fetch] 🚀 Hedged Request salvo na tentativa ${attempt + 1} (${Date.now() - start}ms) p/ ${endpoint} [${carrierInfo.carrier}]`);
            }
            return response;
        } catch (e: any) {
            clearTimeout(timeoutId);
            const isTimeout = e.name === 'AbortError' || e.message === 'Aborted';
            const errorType = classifyError(e);
            
            if (isTimeout) {
                console.warn(
                    `[Supabase Fetch] ⚠️ ${isClaro ? 'Claro CGNAT' : 'TCP'} timeout na tentativa ${attempt + 1} ` +
                    `(${TIMEOUTS[attempt]}ms) [${carrierInfo.carrier}/${carrierInfo.networkType}]. Recriando Socket...`
                );
                // Fim da iteração = vai pro próximo retry instantaneamente
            } else if (errorType === 'DNS' || errorType === 'TLS') {
                // DNS/TLS errors on Claro CAN be transient (CGNAT switching NAT tables)
                // Retry once with delay instead of throwing immediately
                if (isClaro && attempt < RETRIES - 1) {
                    console.warn(
                        `[Supabase Fetch] ⚠️ ${errorType} error na Claro, tentativa ${attempt + 1}. ` +
                        `Aguardando 2s para NAT estabilizar...`
                    );
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }
                throw e;
            } else {
                // Erros de Offline nativo (Avião), não adianta tentar de novo. Interrompe na hora.
                throw e;
            }
        }
    }

    console.error(`[Supabase Fetch] 💀 Falha total de rede após ${RETRIES} tentativas [${carrierInfo.carrier}].`);
    throw new Error('Network request failed');
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
        fetch: customFetch
    },
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        lock: processLock as any,
    },
    realtime: {
        // ─── CGNAT / Claro keepalive tuning (Section 1.1) ────────────────
        // heartbeatIntervalMs: 25s (Claro drops idle TCP in ~60s, need ping every <30s)
        // ANTES: 15s — muito agressivo, gerava tráfego desnecessário
        // DEPOIS: 25s — dentro do window de 60s da Claro com margem de segurança
        heartbeatIntervalMs: 25_000,
        // Timeout longo para handoff 4G/3G (60s dá tempo de reconectar)
        timeout: 60_000,
    }
});

// ─── 🛡️ Auth Diagnostics ───────────────────────────────────────────────────

supabase.auth.onAuthStateChange((event, session) => {
    console.log(`[Mobile Auth] 🔑 Evento: ${event}`);
    if (event === 'TOKEN_REFRESHED') {
        console.log('[Mobile Auth] ✨ Token renovado com sucesso!');
    }
    if (!session && event !== 'SIGNED_OUT' && event !== 'INITIAL_SESSION') {
        console.warn('[Mobile Auth] 🚨 Sessão perdida ou falha no refresh!', { event });
    }
});

// ─── Carrier Detection Warmup ────────────────────────────────────────────────
// Detect carrier early so customFetch has it cached from the first call
if (CLARO_FIX_FLAGS.ENABLE_CARRIER_DETECTION) {
    detectCarrier().then(info => {
        console.log(`[Supabase] 📡 Carrier detectada: ${info.carrier}/${info.networkType} (Claro: ${info.isClaro})`);
    }).catch(() => { /* silent */ });
}

/**
 * 💓 AppState Heartbeat
 * ⚠️ REMOVED: Raw AppState.addEventListener that fired on every foreground return
 *    without debounce/cooldown, causing session refresh storms on unstable networks.
 * 
 *    Session refresh is now handled by AppLifecycleManager with:
 *    - 3s debounce (prevents rapid fire)
 *    - 30s cooldown (prevents token refresh storms)
 *    See: services/app-lifecycle.ts
 */

export const BUCKET_NAME = 'nexus-files';
