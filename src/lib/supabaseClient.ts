// ============================================================
// src/lib/supabaseClient.ts
// 🛡️ NEXUS LINE — Singleton Supabase Client v4.0
// Padrão: Big Tech / Clean Architecture / Zero Gambiarra
//
// GOVERNANÇA (.cursorrules / CONTEXT.md):
//  ✅ UM único createClient para toda a aplicação (Singleton)
//  ✅ autoRefreshToken delegado ao SDK + Recovery ATIVO após inatividade
//  ✅ Lock: Web Locks API nativa ou fallback direto
//  ✅ Fetch com retry exponencial para erros transitórios (5xx / rede)
//  ✅ Recovery por visibilitychange + online + focus
//  ✅ Health Check ATIVO: se JWT expirou durante suspensão, força refresh uma vez
//  ✅ Limpa Cache API do browser no recovery (previne stale data de SW antigo)
//  ✅ Logs condicionais — warn/error SEMPRE, debug/info apenas DEV
//  ✅ Diagnósticos expostos no window para suporte técnico
//
// MUDANÇAS v3 → v4:
//  1. Recovery agora verifica expiração do JWT e chama refreshSession()
//     se o token expirou durante suspensão do OS (autoRefreshToken não
//     dispara se o timer de refresh estava freezed pelo SO)
//  2. Limpa caches do browser no recovery para prevenir SW stale data
//  3. ensureValidSession cooldown reduzido de 15s para 5s
//  4. Removida dependência de lock stealing no index.html
// ============================================================

import { createClient, SupabaseClient, type LockFunc } from '@supabase/supabase-js';

// ---------------------------------------------------------------
// Environment Variables
// ---------------------------------------------------------------
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const isDev = import.meta.env.DEV === true;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[Nexus] 🚨 CRITICAL: VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não configurados!');
}

const safeUrl = supabaseUrl ?? 'https://placeholder.supabase.co';
const safeKey = supabaseAnonKey ?? 'placeholder';

// Registro global de fetches em andamento para matá-los no Wake Up do SO
const activeNexusFetches = new Set<AbortController>();

// ---------------------------------------------------------------
// Lock Strategy — Big Tech Standard
//
// Usa Web Locks API nativa (gerenciada pelo SO, sobrevive a suspensão).
// Fallback silencioso para browsers sem suporte (execução direta).
//
// IMPORTANTE: O lock é passado para o Supabase SDK para serializar
// apenas operações de AUTH (refresh de token). Não é usado para
// serializar chamadas de banco — isso causaria gargalo.
// ---------------------------------------------------------------

const _buildLock = (): LockFunc => {
    // Web Locks API — nativa do browser, sobrevive à suspensão de SO
    if (typeof navigator !== 'undefined' && 'locks' in navigator) {
        // IMPORTANTE: O SDK do Supabase pode chamar com 2 ou 3 params dependendo da versão do gotrue-js
        const webLockFn = (name: string, arg2: number | (() => Promise<unknown>), arg3?: () => Promise<unknown>) => {
            const acquireTimeout = typeof arg2 === 'number' ? arg2 : 0;
            const fn = typeof arg2 === 'function' ? arg2 : arg3;

            if (typeof fn !== 'function') {
                console.error(`[Nexus Lock] 💥 Falha crítica: Callback não recebido para '${name}'`);
                // Evita crashar a aplicação inteira
                return Promise.resolve(null as any);
            }

            const ac = new AbortController();
            const actualTimeout = acquireTimeout > 0 ? acquireTimeout : 2000; // Reduzido para 2s para bater o timeout de 3s da UI

            setTimeout(() => ac.abort(new Error('Nexus Lock Timeout')), actualTimeout);

            return navigator.locks.request(`nexus_auth_${name}`, {
                mode: 'exclusive',
                signal: ac.signal,
            }, fn).catch(err => {
                const isAbort = err.name === 'AbortError' || err.message === 'Nexus Lock Timeout';
                if (isAbort) {
                    console.warn(`[Auth] Lock concorrente ou timeout de ${actualTimeout}ms ('${name}'). Executando bypass sem lock para não travar a inicialização.`);
                    return fn(); // Executa ignorando o Lock para destrancar a UI
                }
                throw err;
            });
        };
        return webLockFn as unknown as LockFunc; // cast para contornar tipagem estrita da interface atual
    }

    // Fallback: execução direta em browsers sem Web Locks
    if (isDev) console.warn('[Nexus Lock] Web Locks API indisponível — usando fallback direto.');
    let fallbackLockPromise: Promise<unknown> | null = null;
    const fallbackFn = async (_name: string, arg2: number | (() => Promise<unknown>), arg3?: () => Promise<unknown>) => {
        const fn = typeof arg2 === 'function' ? arg2 : arg3;
        if (typeof fn !== 'function') return Promise.resolve(null as any);

        // Fila rudimentar para garantir serialidade do Lock
        while (fallbackLockPromise) {
            await fallbackLockPromise;
        }

        fallbackLockPromise = fn().finally(() => {
            fallbackLockPromise = null;
        });

        return fallbackLockPromise;
    };
    return fallbackFn as unknown as LockFunc;
};

const nexusLock: LockFunc = _buildLock();

// ---------------------------------------------------------------
// ✅ Singleton — única instância para toda a aplicação.
// Importado via src/lib/supabase.ts pelos consumidores.
// ---------------------------------------------------------------
export const supabase: SupabaseClient = createClient(safeUrl, safeKey, {
    auth: {
        storageKey: 'nexus_shared_auth',    // Chave única: evita conflito entre projetos no mesmo domínio
        persistSession: true,               // Sessão sobrevive a reload e fechamento de aba
        autoRefreshToken: true,             // SDK gerencia o refresh do JWT — complementado pelo Recovery ativo
        detectSessionInUrl: true,           // Necessário para OAuth e magic link
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        lock: nexusLock,                    // Lock nativo do SO — elimina deadlock por suspensão
    },

    realtime: {
        params: {
            eventsPerSecond: 10,
        },
        heartbeatIntervalMs: 15000,
        timeout: 30000,
    },

    global: {
        // -------------------------------------------------------------
        // Fetch com retry exponencial para erros de rede transitórios.
        // NÃO chama refresh de sessão aqui — o SDK já faz isso.
        // Timeout de 12s por tentativa para prevenir hanging requests (Zombie Promises).
        // -------------------------------------------------------------
        fetch: async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
            const MAX_RETRIES = 2; // Reduzido de 3 para agilizar fallback do Cache
            const BASE_DELAY_MS = 1_000;
            let lastError: unknown;

            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                const controller = new AbortController();
                // Combina signal do caller (se houver) com nosso timeout
                const callerSignal = (init as RequestInit & { signal?: AbortSignal })?.signal;
                if (callerSignal?.aborted) throw new DOMException('Aborted', 'AbortError');

                activeNexusFetches.add(controller);

                // Garante que se o componente abortar, o timeout interno também morre
                const onAbort = () => controller.abort(callerSignal?.reason || new Error('Caller Aborted'));
                if (callerSignal) callerSignal.addEventListener('abort', onAbort);

                // Timeout de 40s (aumentado de 12s) para evitar abortos prematuros
                const timeoutId = setTimeout(() => {
                    controller.abort(new Error('Nexus Fetch Timeout (40s)'));
                }, 40_000);

                try {
                    const response = await fetch(url, {
                        ...init,
                        signal: controller.signal,
                    });
                    clearTimeout(timeoutId);
                    if (callerSignal) callerSignal.removeEventListener('abort', onAbort);
                    activeNexusFetches.delete(controller);

                    // Retry apenas em erros 5xx (servidor) — não em 4xx (cliente)
                    if (response.status >= 500 && response.status < 600 && attempt < MAX_RETRIES) {
                        const delay = BASE_DELAY_MS * Math.pow(2, attempt); // Exponential backoff
                        if (isDev) console.warn(`[Nexus Fetch] HTTP ${response.status} — retry ${attempt + 1}/${MAX_RETRIES} em ${delay}ms`);
                        await new Promise(r => setTimeout(r, delay));
                        continue;
                    }

                    return response;
                } catch (err: unknown) {
                    clearTimeout(timeoutId);
                    activeNexusFetches.delete(controller);
                    lastError = err;

                    const isAbort = err instanceof DOMException && err.name === 'AbortError';
                    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
                    const isNetworkError =
                        err instanceof TypeError && (
                            err.message.includes('Failed to fetch') ||
                            err.message.includes('NetworkError') ||
                            err.message.includes('network')
                        );

                    // Não retenta se foi cancelado explicitamente pelo caller
                    if (isAbort && callerSignal?.aborted) throw err;

                    if ((isNetworkError || (isAbort && !callerSignal?.aborted) || isOffline) && attempt < MAX_RETRIES) {
                        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
                        if (isDev) console.warn(`[Nexus Fetch] Erro de rede — retry ${attempt + 1}/${MAX_RETRIES} em ${delay}ms`);
                        await new Promise(r => setTimeout(r, delay));
                        continue;
                    }

                    throw err;
                }
            }

            throw lastError;
        },
    },
});

// ---------------------------------------------------------------
// Diagnósticos — disponíveis via console para suporte técnico
// Uso: await window.__nexusDiag.ping()
// ---------------------------------------------------------------
export const supabaseDiagnostics = {
    ping: async (): Promise<{ ok: boolean; latencyMs: number; ts: string }> => {
        const start = Date.now();
        const { error } = await supabase.from('users').select('id').limit(1);
        return { ok: !error, latencyMs: Date.now() - start, ts: new Date().toISOString() };
    },

    sessionInfo: async (): Promise<{
        hasSession: boolean;
        expiresAt: string | null;
        isExpired: boolean;
        uid: string | null;
    }> => {
        const { data: { session } } = await supabase.auth.getSession();
        const expiresAt = session?.expires_at ? session.expires_at * 1000 : null;
        return {
            hasSession: !!session,
            expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
            isExpired: expiresAt ? Date.now() > expiresAt : false,
            uid: session?.user?.id ?? null,
        };
    },

    realtimeStatus: (): { channels: number; status: string } => {
        const channels = (supabase as unknown as { realtime?: { channels?: unknown[] } }).realtime?.channels ?? [];
        return { channels: channels.length, status: channels.length > 0 ? 'CONNECTED' : 'INACTIVE' };
    },
};

if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__nexusDiag = supabaseDiagnostics;
}

// ---------------------------------------------------------------
// Recovery Engine v2.0 — Reconexão ATIVA após inatividade
//
// ESTRATÉGIA DEFENSIVA:
//  1. visibilitychange (document) → principal — cobre Safari Mobile
//  2. window.focus → fallback — desktop browsers
//  3. window.online → recovery após queda de rede
//
// NOVIDADE v4.0 — HEALTH CHECK ATIVO:
//  - Verifica se o JWT expirou durante suspensão do SO
//  - Se expirado: chama refreshSession() UMA VEZ com mutex
//  - Se refresh falha: emite evento para AuthContext tratar com logout
//  - Limpa Cache API do browser para prevenir stale data de SW antigo
//
// PROTEÇÕES:
//  - _recoveryInFlight: mutex contra execuções paralelas
//  - Debounce de 400ms: ignora disparos múltiplos simultâneos
//  - Verificação de onLine antes de qualquer call de rede
// ---------------------------------------------------------------
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    let _recoveryInFlight = false;
    let _recoveryTimer: ReturnType<typeof setTimeout> | undefined;

    /**
     * Limpa caches do browser (Cache API) para prevenir stale data
     * de Service Workers antigos que podem interceptar requests.
     */
    const _clearBrowserCaches = async (): Promise<void> => {
        try {
            if ('caches' in window) {
                const cacheNames = await caches.keys();
                if (cacheNames.length > 0) {
                    if (isDev) console.log(`[Nexus Recovery] 🧹 Limpando ${cacheNames.length} cache(s) do browser:`, cacheNames);
                    await Promise.all(cacheNames.map(name => caches.delete(name)));
                }
            }
        } catch (err) {
            // Cache API indisponível ou erro — não crítico
            if (isDev) console.warn('[Nexus Recovery] Cache cleanup error:', err);
        }
    };

    let _refreshPromise: Promise<any> | null = null;
    const singleRefreshSession = () => {
        if (_refreshPromise) return _refreshPromise;
        _refreshPromise = supabase.auth.refreshSession().finally(() => { _refreshPromise = null; });
        return _refreshPromise;
    };

    const _runRecovery = async (source: string): Promise<void> => {
        if (_recoveryInFlight) {
            if (isDev) console.log(`[Nexus Recovery] Ignorado (em andamento) — trigger: ${source}`);
            return;
        }

        _recoveryInFlight = true;
        if (isDev) console.log(`[Nexus Recovery] Iniciando — trigger: ${source}`);

        try {
            if (!navigator.onLine) {
                if (isDev) console.warn('[Nexus Recovery] Offline — adiado.');
                return;
            }

            // ── Step 0: Matar todas as requisições nativas congeladas pelo sistema —
            if (activeNexusFetches.size > 0) {
                if (isDev) console.log(`[Nexus Recovery] 🔪 Matando ${activeNexusFetches.size} conexões em voo presas devido suspensão...`);
                activeNexusFetches.forEach(ac => ac.abort(new Error('Killed by Nexus Recovery (Wake up)')));
                activeNexusFetches.clear();
            }

            // ── Step 1: Limpar caches do browser (proteção contra SW stale) ──
            await _clearBrowserCaches();

            // ── Step 2: Reconectar WebSocket do Realtime ──
            try {
                // Remove canais antigos (zumbis) para evitar eventos duplicados na volta do ambiente suspendido
                try { supabase.removeAllChannels(); } catch (e) { }

                const rt = (supabase as unknown as { realtime?: { connect?: () => void; disconnect?: () => void } }).realtime;
                if (rt?.disconnect && rt?.connect) {
                    rt.disconnect();
                    await new Promise(r => setTimeout(r, 200));
                    rt.connect();
                    if (isDev) console.log('[Nexus Recovery] ✅ Realtime reconectado e channels limpos.');
                }
            } catch (rtErr) {
                if (isDev) console.warn('[Nexus Recovery] Realtime reconnect error (não crítico):', rtErr);
            }

            // ── Step 3: HEALTH CHECK ATIVO — Verifica e recupera JWT ──
            const { data: { session }, error } = await supabase.auth.getSession();

            if (error && isDev) console.warn('[Nexus Recovery] getSession error:', error.message);

            // Verifica se o JWT expirou durante a suspensão do SO
            if (session?.expires_at) {
                const expiresAtMs = session.expires_at * 1000;
                const now = Date.now();
                const isExpired = now > expiresAtMs;
                const isNearExpiry = (expiresAtMs - now) < 60_000; // Menos de 1 minuto para expirar

                if (isExpired || isNearExpiry) {
                    if (isDev) console.warn(`[Nexus Recovery] 🔑 JWT ${isExpired ? 'EXPIRADO' : 'PRÓXIMO DE EXPIRAR'} — forçando refresh ativo...`);

                    try {
                        const { data: refreshData, error: refreshError } = await singleRefreshSession();

                        if (refreshError) {
                            // Refresh falhou — token revogado ou refresh_token expirado
                            console.error('[Nexus Recovery] ❌ Refresh de sessão falhou:', refreshError.message);
                            window.dispatchEvent(new CustomEvent('NEXUS_RECOVERY_COMPLETE', {
                                detail: { source, hasSession: false, refreshFailed: true, ts: Date.now() }
                            }));
                            return;
                        }

                        if (refreshData.session) {
                            if (isDev) console.log('[Nexus Recovery] ✅ JWT renovado com sucesso via refresh ativo.');
                        }
                    } catch (refreshErr) {
                        console.error('[Nexus Recovery] 💥 Exceção no refresh:', refreshErr);
                        window.dispatchEvent(new CustomEvent('NEXUS_RECOVERY_COMPLETE', {
                            detail: { source, hasSession: false, refreshFailed: true, ts: Date.now() }
                        }));
                        return;
                    }
                }
            }

            // ── Step 4: Notifica camadas superiores ──
            window.dispatchEvent(new CustomEvent('NEXUS_RECOVERY_COMPLETE', {
                detail: { source, hasSession: !!session, refreshFailed: false, ts: Date.now() }
            }));

            if (isDev) console.log(`[Nexus Recovery] ✅ Completo — hasSession: ${!!session}`);
        } catch (err) {
            console.error('[Nexus Recovery] 💥 Falha:', err);
        } finally {
            _recoveryInFlight = false;
        }
    };

    const _scheduleRecovery = (source: string) => {
        if (_recoveryTimer !== undefined) clearTimeout(_recoveryTimer);
        _recoveryTimer = setTimeout(() => _runRecovery(source), 400);
    };

    // visibilitychange — principal trigger (Safari Mobile, Chrome Mobile)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') _scheduleRecovery('visibilitychange');
    });

    // focus — fallback para desktop
    window.addEventListener('focus', () => _scheduleRecovery('window.focus'));

    // online — retorno de conectividade
    window.addEventListener('online', () => _scheduleRecovery('network.online'));
}


export type { SupabaseClient };

// ---------------------------------------------------------------
// ensureValidSession
// Re-exportada para retrocompatibilidade com orderService.ts e outros.
// Lê do cache local do SDK (sem chamada de rede forçada).
//
// v4.0: Cooldown reduzido de 15s para 5s para recovery mais responsivo.
// Se o token estiver expirado, o Recovery Engine v2.0 já terá forçado
// o refresh antes desta função ser chamada.
// ---------------------------------------------------------------
let _lastSessionCheckTs = 0;
const SESSION_CHECK_COOLDOWN_MS = 5_000; // v4: reduzido de 15s para 5s

export async function ensureValidSession(): Promise<boolean> {
    const now = Date.now();
    if (now - _lastSessionCheckTs < SESSION_CHECK_COOLDOWN_MS) return true;
    _lastSessionCheckTs = now;

    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
            const isNetwork = error.message.includes('fetch') || error.message.includes('Network') || (typeof navigator !== 'undefined' && !navigator.onLine);
            if (isNetwork) return true; // Preserva estado enquanto offline
            return false;
        }
        return !!session;
    } catch {
        return false;
    }
}
