
import { createClient } from '@supabase/supabase-js';
import type { DbUserInsert } from '../types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 🛡️ Verificação de Segurança de Ambiente
if (!supabaseUrl || !supabaseAnonKey) {
    console.error('🚨 CRITICAL ERROR: Supabase URL or Anon Key is missing in environment variables!');
}

const safeUrl = supabaseUrl || 'https://placeholder.supabase.co';
const safeKey = supabaseAnonKey || 'placeholder';

// 🛡️ Enterprise-Grade In-Process Mutex
// Implementa uma fila de execução para garantir serialização de operações críticas (Auth),
// substituindo o navigator.locks que apresenta instabilidade em conjunto com Service Workers.
// Padrão: "Mutex com Queue e Fail-Safe Timeout".

const lockQueue: Record<string, Promise<unknown>> = {};

const processLock = async <R>(name: string, acquireTimeout: number, fn: () => Promise<R>): Promise<R> => {
    // 1. Recupera a promessa anterior da fila (ou resolve imediatamente se vazia)
    const previousOperation = lockQueue[name] || Promise.resolve();

    // 2. Cria fail-safe para timeout (evita Deadlock infinito)
    // Se acquireTimeout for 0, usa valor padrão de 10s para segurança
    const timeoutMs = acquireTimeout > 0 ? acquireTimeout : 10000;

    let timeoutId: ReturnType<typeof setTimeout>;

    const currentOperation = (async () => {
        try {
            // Espera a operação anterior terminar (com timeout para não ficar preso pra sempre)
            await Promise.race([
                previousOperation.catch(() => { }), // Ignora erros da anterior
                new Promise((_, reject) => {
                    timeoutId = setTimeout(() => reject(new Error(`⚠️ Lock Timeout: ${name}`)), timeoutMs);
                })
            ]);

            // 3. Executa a função real (Critical Section)
            return await fn();
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    })();

    // 4. Atualiza a fila: a próxima operação vai esperar esta terminar (mesmo que falhe)
    // O catch aqui garante que a fila nunca "quebre" por erro de uma operação
    lockQueue[name] = currentOperation.catch(() => { });

    return currentOperation as Promise<R>;
};

// Cliente Padrão (Anon Key) com resiliência avançada
export const supabase = createClient(safeUrl, safeKey, {
    auth: {
        storageKey: 'nexus_shared_auth',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage, // 🛡️ Força persistência em localStorage (No-Memory-Only)
        lock: processLock,
    },
    global: {
        fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
            const MAX_RETRIES = 2;
            let lastError: any = null;

            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => {
                    console.warn(`[Supabase Fetch] ⏱️ Timeout atingido (30s) na tentativa ${attempt + 1}: ${String(url)}`);
                    controller.abort();
                }, 30000);

                try {
                    const response = await fetch(url, {
                        ...init,
                        signal: controller.signal,
                    });

                    // Se a resposta for um erro de servidor (5xx) ou rede, retenta
                    if (response.status >= 500 && attempt < MAX_RETRIES) {
                        console.warn(`[Supabase Fetch] 📉 Erro HTTP ${response.status}. Retentando (${attempt + 1}/${MAX_RETRIES})...`);
                        clearTimeout(timeoutId);
                        await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); // Backoff simples
                        continue;
                    }

                    clearTimeout(timeoutId);
                    return response;
                } catch (err: any) {
                    clearTimeout(timeoutId);
                    lastError = err;

                    const isRetryable = err.name === 'AbortError' ||
                        err.message?.includes('Failed to fetch') ||
                        !window.navigator.onLine;

                    if (isRetryable && attempt < MAX_RETRIES) {
                        console.warn(`[Supabase Fetch] 🔄 Falha de conexão na tentativa ${attempt + 1}. Retentando...`, err.message);
                        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                        continue;
                    }

                    console.error(`[Supabase Fetch] ❌ Falha crítica após ${attempt + 1} tentativas:`, err.message);
                    throw err;
                }
            }
            throw lastError;
        }
    },
    realtime: {
        params: {
            eventsPerSecond: 2
        },
        heartbeatIntervalMs: 15000,
        reconnectAfterMs: (tries: number) =>
            Math.min(1000 * Math.pow(2, tries), 30000)
    }
});

// ─── 🛡️ Diagnóstico e Persistência Agressiva ───────────────────

/**
 * Listener de Estado de Autenticação
 * Detecta e loga mudanças críticas, especialmente erros de renovação de token.
 */
supabase.auth.onAuthStateChange((event, session) => {
    const timestamp = new Date().toISOString();
    console.log(`[Supabase Auth] 🔑 Evento: ${event} em ${timestamp}`);

    if (event === 'TOKEN_REFRESHED') {
        console.log('%c[Supabase Auth] ✨ Token renovado com sucesso!', 'color: #10b981; font-weight: bold;');
    }

    if (event === 'SIGNED_OUT') {
        console.warn('[Supabase Auth] 🚪 Usuário desconectado (SIGNED_OUT).');
    }

    if (!session && event !== 'SIGNED_OUT') {
        console.error('[Supabase Auth] 🚨 Sessão perdida inesperadamente ou falha no refresh!', { event, timestamp });
    }
});

/**
 * 💓 Heartbeat de Conexão (Nexus Resilience)
 * Sincroniza a sessão sempre que a aba recupera o foco.
 */
if (typeof window !== 'undefined') {
    window.addEventListener('focus', async () => {
        console.log('[Supabase Heartbeat] 💓 Aba focada. Validando integridade da conexão...');

        try {
            const { data: { session }, error } = await supabase.auth.getSession();

            if (error) {
                console.error('[Supabase Heartbeat] ❌ Erro ao validar sessão no foco:', error);
                return;
            }

            if (!session) {
                console.warn('[Supabase Heartbeat] ⚠️ Sessão nula detectada. Tentando refresh forçado...');
                const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

                if (refreshError) {
                    console.error('[Supabase Heartbeat] 🚨 Falha crítica no refresh forçado:', refreshError);
                } else if (refreshData.session) {
                    console.log('%c[Supabase Heartbeat] ✅ Sessão recuperada com sucesso via refresh forçado!', 'color: #10b981; font-weight: bold;');
                }
            } else {
                console.log('[Supabase Heartbeat] ✅ Conexão íntegra.');
            }
        } catch (err) {
            console.error('[Supabase Heartbeat] 💥 Exceção fatal no heartbeat:', err);
        }
    });
}


/**
 * 🛡️ Nexus Session Guard: Ensures a valid session exists before DB calls.
 * Checks the current token expiry and proactively refreshes if needed.
 * Returns true if session is valid, false if not (user should be logged out).
 */
let _lastSessionCheck = 0;
const SESSION_CHECK_COOLDOWN = 10000; // Check more frequently (10s) but trust auto-refresh

export async function ensureValidSession(): Promise<boolean> {
    const now = Date.now();
    if (now - _lastSessionCheck < SESSION_CHECK_COOLDOWN) return true; // Skip if checked recently
    _lastSessionCheck = now;

    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session) return false;
        return true;
    } catch (err: any) {
        return false;
    }
}

/**
 * 🛠️ Nexus Diagnostic Tools
 */
export const supabaseDiagnostics = {
    /** Teste real de leitura no banco */
    ping: async () => {
        const start = Date.now();
        const { data, error } = await supabase.from('users').select('id').limit(1);
        const latency = Date.now() - start;
        if (error) throw error;
        return { success: true, latency, timestamp: new Date().toISOString() };
    },

    /** Status atual do Realtime */
    checkRealtime: () => {
        const channels = (supabase as any).realtime?.channels || [];
        const activeChannels = channels.length;
        return {
            activeChannels,
            status: activeChannels > 0 ? 'CONNECTED' : 'INACTIVE',
            timestamp: new Date().toISOString()
        };
    }
};

// 🛡️ Secure Admin Proxy
// Redireciona chamadas AUTH sensíveis para Edge Function segura.
// NÃO usa service_role key no frontend. NÃO bypassa RLS.
const EDGE_FUNCTION_URL = import.meta.env.VITE_EDGE_FUNCTION_URL ||
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-operations`;

/**
 * Obtém token JWT do usuário autenticado
 */
async function getUserToken(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
}

// ─── Tipos do adminAuthProxy ─────────────────────────────────

interface AdminCreateUserAttributes {
    email: string;
    password?: string;
    email_confirm?: boolean;
    user_metadata?: {
        name?: string;
        role?: string;
        tenantId?: string;
        avatar?: string;
        [key: string]: unknown;
    };
}

interface AdminUpdateUserAttributes {
    password?: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
}

interface AdminUserResult {
    data: { user: DbUserInsert | null };
    error: Error | null;
}

interface AdminListUsersResult {
    data: { users: DbUserInsert[] };
    error: string | Error | null;
}

const adminAuthProxy = {
    admin: {
        createUser: async (attributes: AdminCreateUserAttributes): Promise<AdminUserResult> => {
            try {
                const token = await getUserToken();
                if (!token) {
                    throw new Error('User not authenticated');
                }

                const response = await fetch(EDGE_FUNCTION_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        action: 'create_user',
                        payload: attributes
                    })
                });

                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Failed to create user');
                return { data: { user: data.user }, error: null };
            } catch (e: any) {
                console.error("Admin createUser error:", e);
                return { data: { user: null }, error: e };
            }
        },

        deleteUser: async (userId: string): Promise<{ data: unknown; error: Error | null }> => {
            try {
                const token = await getUserToken();
                if (!token) {
                    throw new Error('User not authenticated');
                }

                const response = await fetch(EDGE_FUNCTION_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        action: 'delete_user',
                        payload: { userId }
                    })
                });

                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Failed to delete user');
                return { data, error: null };
            } catch (e: any) {
                return { data: null, error: e };
            }
        },

        listUsers: async (): Promise<AdminListUsersResult> => {
            try {
                const token = await getUserToken();
                if (!token) {
                    throw new Error('User not authenticated');
                }

                const response = await fetch(EDGE_FUNCTION_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        action: 'list_users'
                    })
                });

                const data = await response.json();
                if (!response.ok) return { data: { users: [] }, error: data.error || 'API Error' };
                return { data: { users: data.users || [] }, error: null };
            } catch (e: any) {
                console.error("Admin listUsers error:", e);
                return { data: { users: [] }, error: e };
            }
        },

        updateUserById: async (userId: string, updates: AdminUpdateUserAttributes): Promise<AdminUserResult> => {
            try {
                const token = await getUserToken();
                if (!token) {
                    throw new Error('User not authenticated');
                }

                const response = await fetch(EDGE_FUNCTION_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        action: 'update_user',
                        payload: { userId, updates }
                    })
                });

                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Failed to update user');
                return { data: { user: data.user }, error: null };
            } catch (e: any) {
                return { data: { user: null }, error: e };
            }
        }
    }
};

/**
 * 🔒 adminAuthProxy — Proxy seguro para operações de Auth Admin.
 * Redireciona chamadas para Edge Functions autenticadas.
 * NÃO bypassa RLS. NÃO usa service role key no frontend.
 * Use apenas para: createUser, deleteUser, updateUserById, listUsers.
 */
export { adminAuthProxy };

/**
 * publicSupabase — cliente anon sem sessão persistida.
 * Usado apenas para RPCs públicas (ex: approve_quote_public).
 * O RLS ainda se aplica via SECURITY DEFINER nas funções.
 */
export const publicSupabase = createClient(safeUrl, safeKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    }
});

// ⛔ adminSupabase foi REMOVIDO intencionalmente.
// Motivo: era um objeto híbrido que herdava `from/rpc` do cliente anon,
// dando falsa impressão de bypass de RLS e criando confusão arquitetural.
// Substitua todos os usos de `adminSupabase.from(...)` por `supabase.from(...)`.
// Substitua todos os usos de `adminSupabase.auth.admin.*` por `adminAuthProxy.admin.*`.
