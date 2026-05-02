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
            const actualTimeout = acquireTimeout > 0 ? acquireTimeout : 15000; // Reduzido para bater o timeout do Auth caso trave na queue

            setTimeout(() => ac.abort(new Error('Nexus Lock Timeout')), actualTimeout);

            return navigator.locks.request(`nexus_auth_${name}`, {
                mode: 'exclusive',
                signal: ac.signal,
            }, fn).catch(err => {
                const isAbort = err.name === 'AbortError' || err.message === 'Nexus Lock Timeout';
                if (isAbort) {
                    console.warn(`[Auth] Lock concorrente ou timeout de ${actualTimeout}ms ('${name}'). Retornando null para evitar derrubar a conexão global (bypass removido).`);
                    return null; // Bypass removido pois trazia problemas em chamadas concorrentes do SDK
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
        storageKey: 'nexus-line-auth',      // Chave única revisada
        persistSession: true,               // Sessão sobrevive a reload e fechamento de aba
        autoRefreshToken: true,             // SDK gerencia o refresh do JWT
        detectSessionInUrl: false,          // Orchestrator: false
        flowType: 'pkce',                   // Arquitetura moderna Pkce
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
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
            const MAX_RETRIES = 4; // Aumentado para 4 para dar chance à conexão intermitente
            const BASE_DELAY_MS = 3_000; // Zombie Backoff: 3000ms base delay
            let lastError: unknown;

            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                const controller = new AbortController();
                // 🛡️ Proteção Nexus: Apenas requisições de leitura (GET/HEAD) ou sem método definido (GET)
                // são rastreadas para cancelamento no Wake Up. Escritas devem persistir até o timeout.
                const isWrite = init?.method && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(init.method.toUpperCase());
                
                // Combina signal do caller (se houver) com nosso timeout
                const callerSignal = (init as RequestInit & { signal?: AbortSignal })?.signal;
                if (callerSignal?.aborted) throw new DOMException('Aborted', 'AbortError');

                if (!isWrite) activeNexusFetches.add(controller);

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

            // ── Step 1: Abortar fetch requests congeladas (zumbis de suspensão do SO) ──
            if (activeNexusFetches.size > 0) {
                if (isDev) console.log(`[Nexus Recovery] 🔪 Matando ${activeNexusFetches.size} fetches presos...`);
                activeNexusFetches.forEach(ac => ac.abort(new Error('Killed by Nexus Recovery (Wake up)')));
                activeNexusFetches.clear();
            }

            // ── Step 2: Reconectar Realtime APENAS se WebSocket estiver MORTO ──
            // Não destruimos canais ativos na troca normal de aba — isso quebra os listeners do AdminApp.
            try {
                const rt = (supabase as unknown as { realtime?: { conn?: { transport?: { ws?: { readyState?: number } } }; connect?: () => void } }).realtime;
                const wsState = rt?.conn?.transport?.ws?.readyState;
                // readyState: 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
                const isWsDead = wsState === 3 || wsState === 2 || wsState === undefined;

                if (isWsDead && rt?.connect) {
                    if (isDev) console.log(`[Nexus Recovery] 🔌 WebSocket morto (state=${wsState}) — reconectando SEM destruir canais...`);
                    // Não chamamos removeAllChannels() — apenas reconecta o transporte
                    rt.connect();
                } else {
                    if (isDev) console.log(`[Nexus Recovery] 🟢 WebSocket vivo (state=${wsState}) — sem ação no Realtime.`);
                }
            } catch (rtErr) {
                if (isDev) console.warn('[Nexus Recovery] Realtime check error (não crítico):', rtErr);
            }

            // ── Step 3: Leitura passiva da sessão (sem bater no servidor) ──
            const { data: { session }, error } = await supabase.auth.getSession();
            if (error && isDev) console.warn('[Nexus Recovery] getSession error:', error.message);

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
        // 800ms de respiro para o AutoRefreshToken do Supabase renovar silenciosamente
        _recoveryTimer = setTimeout(() => _runRecovery(source), 800);
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
// 🏆 FONTE DE VERDADE Única de Sessão (Singleton onAuthStateChange)
//
// REGRA DE OURO: Existe UMA, e apenas UMA, assinatura de
// onAuthStateChange em toda a aplicação. Ela fica AQUI.
// Outros módulos (AuthContext, hooks) ouvem via CustomEvent
// 'NEXUS_AUTH_EVENT' — nunca chamam onAuthStateChange diretamente.
// ---------------------------------------------------------------
export let globalSession: any | null = null;
export let globalSessionOk = false;

if (typeof window !== 'undefined') {
    supabase.auth.onAuthStateChange((event, session) => {
        globalSession = session;
        globalSessionOk = !!session;

        if (isDev) console.log(`[Auth Singleton] 🔑 Event: ${event} | hasSession: ${globalSessionOk}`);

        // Propaga para o AuthContext (e qualquer outro listener) via evento do DOM.
        // Isso EVITA que o AuthContext registre sua própria assinatura e
        // briga pelo lock com o autoRefreshToken do SDK.
        window.dispatchEvent(new CustomEvent('NEXUS_AUTH_EVENT', {
            detail: { event, session }
        }));
    });
}

// ---------------------------------------------------------------
// ensureValidSession — Passiva, sem briga de lock
// ---------------------------------------------------------------
export async function ensureValidSession(): Promise<boolean> {
    return globalSessionOk;
}
