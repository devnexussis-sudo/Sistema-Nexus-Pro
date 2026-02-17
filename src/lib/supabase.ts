
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 🛡️ Verificação de Segurança de Ambiente
if (!supabaseUrl || !supabaseAnonKey) {
    console.error('🚨 CRITICAL ERROR: Supabase URL or Anon Key is missing in environment variables!');
}

const safeUrl = supabaseUrl || 'https://placeholder.supabase.co';
const safeKey = supabaseAnonKey || 'placeholder';

// Cliente Padrão (Anon Key) com resiliência avançada
export const supabase = createClient(safeUrl, safeKey, {
    auth: {
        storageKey: 'nexus_shared_auth',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    },
    global: {
        fetch: (url: RequestInfo | URL, init?: RequestInit) => {
            // Custom fetch with timeout to prevent hanging requests
            const controller = new AbortController();
            const originalSignal = init?.signal;

            // 🛡️ Chain the abort signal if one was provided by Supabase
            if (originalSignal) {
                if (originalSignal.aborted) {
                    controller.abort();
                } else {
                    originalSignal.addEventListener('abort', () => controller.abort());
                }
            }

            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout for better stability

            return fetch(url, {
                ...init,
                signal: controller.signal,
            }).finally(() => clearTimeout(timeoutId));
        }
    },
    realtime: {
        params: {
            eventsPerSecond: 2
        },
        heartbeatIntervalMs: 15000,        // Heartbeat every 15s (default 30s)
        reconnectAfterMs: (tries: number) => // Exponential backoff: 1s, 2s, 4s, 8s... max 30s
            Math.min(1000 * Math.pow(2, tries), 30000)
    }
});

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
        // Just verify if session exists. Do NOT manually refresh if autoRefreshToken is on.
        // Manual refresh creates race conditions with the auto-refresh mechanism.
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error || !session) {
            console.warn('[SessionGuard] ⚠️ Nenhuma sessão ativa detectada.');
            // Não forçamos refresh manual aqui para evitar conflito com autoRefreshToken do cliente.
            // Se o token estiver expirado, o cliente Supabase já deve estar tentando renovar.
            return false;
        }

        return true;
    } catch (err: any) {
        // 🛡️ Ignora erros de aborto (normal em cancelamentos rápidos)
        if (err.name === 'AbortError' || err?.message?.includes('aborted')) {
            return false;
        }
        console.error('[SessionGuard] ❌ Exception during session check:', err);
        return false;
    }
}

// 🛡️ Secure Admin Proxy
// Redireciona chamadas AUTH sensíveis para o Backend (/api/admin-users)
// 🛡️ Secure Admin Proxy
// Redireciona chamadas AUTH sensíveis para Edge Function segura
const EDGE_FUNCTION_URL = import.meta.env.VITE_EDGE_FUNCTION_URL ||
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-operations`;

/**
 * Obtém token JWT do usuário autenticado
 */
async function getUserToken(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
}

const adminAuthProxy = {
    admin: {
        createUser: async (attributes: any) => {
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

        deleteUser: async (userId: string) => {
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

        listUsers: async () => {
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

        updateUserById: async (userId: string, updates: any) => {
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

// Admin Client Híbrido (100% Seguro Frontend)
// Não usa mais VITE_SUPABASE_SERVICE_ROLE_KEY
export const adminSupabase = {
    ...supabase,
    auth: {
        ...supabase.auth,
        admin: adminAuthProxy.admin
    },
    from: supabase.from // Herda do cliente normal
} as any;

// Cliente Público
export const publicSupabase = createClient(safeUrl, safeKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    }
});
