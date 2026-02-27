// ============================================================
// src/lib/supabaseClient.ts
// 🛡️ NEXUS LINE — Singleton Supabase Client
// Padrão: Big Tech / Clean Architecture / Singleton Pattern
//
// REGRAS DE GOVERNANÇA (.cursorrules):
//  ✅ UM único createClient para toda a aplicação
//  ✅ autoRefreshToken delegado ao SDK — zero refreshSession() manual
//  ✅ processLock in-memory para serializar chamadas de auth concorrentes
//  ✅ Listeners de visibilitychange + online para recuperação de inatividade
//  ✅ Sem logs de debug em produção (isDev guard)
//  ✅ Sem chamadas de rede em loops (ensureValidSession NUNCA é chamado
//     dentro do fetch interceptor para evitar recursão)
// ============================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

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

// ---------------------------------------------------------------
// In-process Mutex — serializa operações críticas de auth entre
// múltiplas abas/calls concorrentes sem race conditions.
// O lock é in-memory: cada tab tem o seu próprio. Para cross-tab,
// o Supabase SDK usa o BroadcastChannel nativo automaticamente.
// ---------------------------------------------------------------
type LockName = string;
const _lockQueue: Record<LockName, Promise<unknown>> = {};

async function _acquireLock<R>(
    name: LockName,
    timeoutMs: number,
    fn: () => Promise<R>
): Promise<R> {
    const previous = _lockQueue[name] ?? Promise.resolve();
    const effectiveTimeout = timeoutMs > 0 ? timeoutMs : 10_000;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const current = (async () => {
        try {
            await Promise.race([
                previous.catch(() => { }), // Erros anteriores não bloqueiam o próximo
                new Promise<never>((_, reject) => {
                    timeoutId = setTimeout(
                        () => reject(new Error(`[Nexus Lock] Timeout após ${effectiveTimeout}ms: ${name}`)),
                        effectiveTimeout
                    );
                }),
            ]);
            return await fn();
        } finally {
            if (timeoutId !== undefined) clearTimeout(timeoutId);
        }
    })();

    // Mantém a fila viva mesmo se a operação falhar
    _lockQueue[name] = current.catch(() => { });
    return current as Promise<R>;
}

// ---------------------------------------------------------------
// ✅ Singleton — única instância para toda a aplicação.
// Exportado diretamente; componentes importam via src/lib/supabase.ts
// ---------------------------------------------------------------
export const supabase: SupabaseClient = createClient(safeUrl, safeKey, {
    auth: {
        storageKey: 'nexus_shared_auth',    // Chave única no localStorage
        persistSession: true,               // Sessão sobrevive a reload/fechamento de tab
        autoRefreshToken: true,             // SDK gerencia refresh do JWT automaticamente
        detectSessionInUrl: true,           // Necessário para OAuth e reset de senha
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        lock: _acquireLock,                 // Mutex próprio: evita race conditions de refresh
    },

    // -----------------------------------------------------------
    // Fetch com retry para erros de rede transitórios (5xx / offline)
    // NÃO chama ensureValidSession aqui para evitar loops de recursão.
    // O autoRefreshToken do SDK já garante tokens válidos antes de cada call.
    // -----------------------------------------------------------
    global: {
        fetch: async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
            const MAX_RETRIES = 2;
            let lastError: unknown = null;

            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30_000); // 30s timeout

                try {
                    const response = await fetch(url, { ...init, signal: controller.signal });
                    clearTimeout(timeoutId);

                    if (response.status >= 500 && attempt < MAX_RETRIES) {
                        if (isDev) console.warn(`[Nexus Fetch] HTTP ${response.status} — retry ${attempt + 1}/${MAX_RETRIES}`);
                        await new Promise(r => setTimeout(r, 1_000 * (attempt + 1)));
                        continue;
                    }

                    return response;
                } catch (err: unknown) {
                    clearTimeout(timeoutId);
                    lastError = err;

                    const isNetworkError =
                        (err instanceof Error && (
                            err.name === 'AbortError' ||
                            err.message.includes('Failed to fetch') ||
                            err.message.includes('NetworkError')
                        )) ||
                        (typeof navigator !== 'undefined' && !navigator.onLine);

                    if (isNetworkError && attempt < MAX_RETRIES) {
                        if (isDev) console.warn(`[Nexus Fetch] Erro de rede — retry ${attempt + 1}/${MAX_RETRIES}`);
                        await new Promise(r => setTimeout(r, 1_000 * (attempt + 1)));
                        continue;
                    }

                    console.error('[Nexus Fetch] ❌ Falha crítica após retries:', err);
                    throw err;
                }
            }

            throw lastError;
        },
    },
});

// ---------------------------------------------------------------
// ensureValidSession
//
// ⚠️ REGRA CRÍTICA: Não chama refreshSession() manualmente.
// O SDK com autoRefreshToken:true gerencia o refresh automaticamente
// via onAuthStateChange(TOKEN_REFRESHED). Chamadas manuais de refresh
// causam invalidação do refresh token (race condition).
//
// Esta função apenas verifica se existe uma sessão ativa no cache
// local (sem chamada de rede), retornando false para tratar no
// AuthContext com logout defensivo.
// ---------------------------------------------------------------
let _lastSessionCheckTs = 0;
const SESSION_CHECK_COOLDOWN_MS = 15_000; // Máximo 1 check a cada 15s

export async function ensureValidSession(): Promise<boolean> {
    const now = Date.now();

    // Cooldown: evita flood de verificações se chamado em cascata
    if (now - _lastSessionCheckTs < SESSION_CHECK_COOLDOWN_MS) {
        return true; // Assume válida se checamos recentemente
    }
    _lastSessionCheckTs = now;

    try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
            // Erros de rede não devem gerar logout — o SDK vai retry
            const isNetworkIssue =
                error.message.includes('Failed to fetch') ||
                error.message.includes('Network') ||
                error.message.includes('network') ||
                (typeof navigator !== 'undefined' && !navigator.onLine);

            if (isNetworkIssue) {
                console.warn('[Nexus Session] ⚠️ Erro de rede ao verificar sessão. Estado local preservado.');
                return true; // Preserva estado enquanto offline
            }

            console.error('[Nexus Session] ❌ Erro de sessão:', error.message);
            return false;
        }

        return !!session;
    } catch (err: unknown) {
        console.error('[Nexus Session] 💥 Exceção inesperada:', err);
        return false;
    }
}

// ---------------------------------------------------------------
// Ferramentas de Diagnóstico (disponíveis em dev e produção para
// suporte técnico via console)
// ---------------------------------------------------------------
export const supabaseDiagnostics = {
    /**
     * Testa latência real com o banco de dados.
     * Uso: await window.__nexusDiag.ping()
     */
    ping: async (): Promise<{ success: boolean; latencyMs: number; timestamp: string }> => {
        const start = Date.now();
        const { error } = await supabase.from('users').select('id').limit(1);
        const latencyMs = Date.now() - start;
        if (error) throw error;
        return { success: true, latencyMs, timestamp: new Date().toISOString() };
    },

    /**
     * Verifica o status dos canais Realtime ativos.
     */
    checkRealtime: (): { activeChannels: number; status: 'CONNECTED' | 'INACTIVE'; timestamp: string } => {
        const channels = (supabase as unknown as { realtime?: { channels?: unknown[] } }).realtime?.channels ?? [];
        const activeChannels = channels.length;
        return {
            activeChannels,
            status: activeChannels > 0 ? 'CONNECTED' : 'INACTIVE',
            timestamp: new Date().toISOString(),
        };
    },

    /**
     * Retorna status da sessão atual sem efeitos colaterais.
     */
    sessionInfo: async (): Promise<{
        hasSession: boolean;
        expiresAt: string | null;
        userId: string | null;
    }> => {
        const { data: { session } } = await supabase.auth.getSession();
        return {
            hasSession: !!session,
            expiresAt: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
            userId: session?.user?.id ?? null,
        };
    },
};

// ---------------------------------------------------------------
// Expõe diagnósticos no window para uso por suporte técnico no console
// ---------------------------------------------------------------
if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__nexusDiag = supabaseDiagnostics;
}

// ---------------------------------------------------------------
// Recovery Listeners — Reconexão após inatividade / retorno de aba
//
// PROBLEMA RESOLVIDO: 'focus' não dispara em PWAs mobile quando o
// usuário retorna ao app via task switcher. O evento correto é
// document.visibilitychange com visibilityState === 'visible'.
//
// ESTRATÉGIA:
//  1. visibilitychange → principal trigger de recovery
//  2. window.focus → fallback para desktop browsers
//  3. online → recovery após queda de rede
//
// PROTEÇÃO: _recoveryInFlight garante que não há chamadas paralelas.
// ---------------------------------------------------------------
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    let _recoveryInFlight = false;
    let _recoveryDebounce: ReturnType<typeof setTimeout> | undefined;

    const _recoverConnection = async (source: string): Promise<void> => {
        if (_recoveryInFlight) return;

        // Debounce: se múltiplos eventos chegarem juntos (focus + visibilitychange),
        // executa apenas uma vez após 300ms
        if (_recoveryDebounce !== undefined) clearTimeout(_recoveryDebounce);

        _recoveryDebounce = setTimeout(async () => {
            if (_recoveryInFlight) return;
            _recoveryInFlight = true;

            if (isDev) console.log(`[Nexus Recovery] Iniciando recovery — trigger: ${source}`);

            try {
                // 1. Verifica conectividade antes de tentar qualquer coisa
                if (!navigator.onLine) {
                    if (isDev) console.warn('[Nexus Recovery] Offline — recovery adiado.');
                    return;
                }

                // 2. Reconecta canais Realtime que possam ter sido suspensos pelo browser/SO
                const realtimeClient = (supabase as unknown as { realtime?: { connect?: () => void } }).realtime;
                if (realtimeClient?.connect) {
                    realtimeClient.connect();
                    if (isDev) console.log('[Nexus Recovery] ✅ Realtime reconnected.');
                }

                // 3. getSession() toca o SDK — se o token estiver prestes a expirar,
                //    o autoRefreshToken vai disparar a renovação em background via
                //    onAuthStateChange(TOKEN_REFRESHED) sem precisamos intervir.
                const { data: { session }, error } = await supabase.auth.getSession();

                if (error) {
                    console.error('[Nexus Recovery] ❌ Erro ao verificar sessão:', error.message);
                    return;
                }

                if (!session) {
                    console.warn('[Nexus Recovery] ⚠️ Sem sessão ativa após recovery. AuthContext irá tratar.');
                }

                // 4. Dispara evento global para que o AuthContext e queries React
                //    possam re-validar seus dados sem saber da infra
                window.dispatchEvent(new CustomEvent('NEXUS_RECOVERY_COMPLETE', {
                    detail: { source, hasSession: !!session, timestamp: Date.now() }
                }));

                if (isDev) console.log('[Nexus Recovery] ✅ Recovery completo.');
            } catch (err: unknown) {
                console.error('[Nexus Recovery] 💥 Falha no recovery:', err);
            } finally {
                _recoveryInFlight = false;
            }
        }, 300);
    };

    // Trigger #1: Visibilidade da aba (principal — cobre PWA mobile)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            _recoverConnection('visibilitychange');
        }
    });

    // Trigger #2: Focus da janela (fallback desktop)
    window.addEventListener('focus', () => {
        _recoverConnection('window.focus');
    });

    // Trigger #3: Reconexão de rede
    window.addEventListener('online', () => {
        _recoverConnection('network.online');
    });
}

// Re-export de tipo para consumidores que precisam
export type { SupabaseClient };
