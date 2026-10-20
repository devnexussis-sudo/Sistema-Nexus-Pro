// src/lib/supabase.ts
// Thin wrapper that re‑exports the singleton client and provides a public client.
import { createClient } from '@supabase/supabase-js';
import { supabase, ensureValidSession, supabaseDiagnostics } from './supabaseClient';
import type { DbUserInsert } from '../types/database';
import { SessionStorage } from './sessionStorage';

// Export the main singleton and resilience helpers for the application
export { supabase, ensureValidSession, supabaseDiagnostics };

// ---------------------------------------------------------------------
// Public client – no persisted session, no auto‑refresh
// Used specifically for public RPCs (e.g., public quote approval)
// ---------------------------------------------------------------------
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('🚨 CRITICAL: Supabase URL or ANON KEY missing!');
}

export const safeUrl = supabaseUrl ?? 'https://placeholder.supabase.co';
export const safeKey = supabaseAnonKey ?? 'placeholder';

export const publicSupabase = createClient(safeUrl, safeKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'nexus_public_auth_token'
    },
});

// ---------------------------------------------------------------------
// 🛡️ adminAuthProxy — Secure Proxy for Admin Auth operations.
// Redirects sensitive calls to a secure Edge Function.
// DOES NOT use service_role key on frontend. DOES NOT bypass RLS.
// ---------------------------------------------------------------------

const EDGE_FUNCTION_URL = import.meta.env.VITE_EDGE_FUNCTION_URL ||
    `${safeUrl}/functions/v1/admin-operations`;

async function getAdminFetchConfig(): Promise<{ headers: Record<string, string>; masterToken?: string }> {
    // 1. Tenta pegar a sessão ativa oficial do Supabase Auth
    let jwtToken: string | null = null;
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) jwtToken = session.access_token;
    } catch {}

    // 2. Extrai de storage de autenticação persistida ('nexus-line-auth')
    if (!jwtToken) {
        try {
            const rawAuth = sessionStorage.getItem('nexus-line-auth') || localStorage.getItem('nexus-line-auth');
            if (rawAuth) {
                const parsed = JSON.parse(rawAuth);
                const tok = parsed?.access_token || parsed?.currentSession?.access_token || parsed?.session?.access_token;
                if (tok && typeof tok === 'string') jwtToken = tok.trim();
            }
        } catch {}
    }

    // 3. Tenta obter o Master Session Token
    let masterToken: string | null = null;
    try {
        masterToken = SessionStorage.get<string>('master_session_token') ||
                      sessionStorage.getItem('master_session_token') ||
                      localStorage.getItem('master_session_token');
        if (typeof masterToken === 'string') masterToken = masterToken.trim();
    } catch {}

    if (!masterToken) {
        try {
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                if (key && key.endsWith('_master_session_token')) {
                    const raw = sessionStorage.getItem(key);
                    if (raw) {
                        try {
                            const parsed = JSON.parse(raw);
                            if (typeof parsed === 'string' && parsed.trim().length > 0) {
                                masterToken = parsed.trim();
                                break;
                            }
                        } catch {
                            if (raw.trim().length > 0) {
                                masterToken = raw.trim();
                                break;
                            }
                        }
                    }
                }
            }
        } catch {}
    }

    if (!jwtToken && !masterToken) {
        throw new Error('User not authenticated');
    }

    // Passa o JWT real se houver. Se for masterToken avulso, usa safeKey no Bearer para Kong permitir a passagem,
    // e passa o masterToken em x-master-token e no body para a Edge Function autenticar com privilégio máximo.
    const bearer = jwtToken || safeKey;

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'apikey': safeKey,
        'Authorization': `Bearer ${bearer}`
    };

    if (masterToken) {
        headers['x-master-token'] = masterToken;
    }

    return { headers, masterToken: masterToken || undefined };
}

// Typing for adminAuthProxy
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

export const adminAuthProxy = {
    admin: {
        createUser: async (attributes: AdminCreateUserAttributes): Promise<AdminUserResult> => {
            try {
                const { headers, masterToken } = await getAdminFetchConfig();

                const response = await fetch(EDGE_FUNCTION_URL, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        action: 'create_user',
                        payload: attributes,
                        ...(masterToken ? { master_token: masterToken } : {})
                    })
                });

                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    const errorMsg = data.error || data.message || data.msg || `Falha ao criar usuário (${response.status})`;
                    throw new Error(errorMsg);
                }
                return { data: { user: data.user }, error: null };
            } catch (e: any) {
                console.error("Admin createUser error:", e);
                return { data: { user: null }, error: e };
            }
        },

        deleteUser: async (userId: string): Promise<{ data: unknown; error: Error | null }> => {
            try {
                const { headers, masterToken } = await getAdminFetchConfig();

                const response = await fetch(EDGE_FUNCTION_URL, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        action: 'delete_user',
                        payload: { userId },
                        ...(masterToken ? { master_token: masterToken } : {})
                    })
                });

                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    const errorMsg = data.error || data.message || data.msg || `Falha ao excluir usuário (${response.status})`;
                    throw new Error(errorMsg);
                }
                return { data, error: null };
            } catch (e: any) {
                return { data: null, error: e };
            }
        },

        listUsers: async (): Promise<AdminListUsersResult> => {
            try {
                const { headers, masterToken } = await getAdminFetchConfig();

                const response = await fetch(EDGE_FUNCTION_URL, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        action: 'list_users',
                        ...(masterToken ? { master_token: masterToken } : {})
                    })
                });

                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    const errorMsg = data.error || data.message || data.msg || 'API Error';
                    return { data: { users: [] }, error: errorMsg };
                }
                return { data: { users: data.users || [] }, error: null };
            } catch (e: any) {
                console.error("Admin listUsers error:", e);
                return { data: { users: [] }, error: e };
            }
        },

        updateUserById: async (userId: string, updates: AdminUpdateUserAttributes): Promise<AdminUserResult> => {
            try {
                const { headers, masterToken } = await getAdminFetchConfig();

                const response = await fetch(EDGE_FUNCTION_URL, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        action: 'update_user',
                        payload: { userId, updates },
                        ...(masterToken ? { master_token: masterToken } : {})
                    })
                });

                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    const errorMsg = data.error || data.message || data.msg || `Falha ao atualizar usuário (${response.status})`;
                    throw new Error(errorMsg);
                }
                return { data: { user: data.user }, error: null };
            } catch (e: any) {
                return { data: { user: null }, error: e };
            }
        },

        provisionTenantAdmin: async (payload: { tenantId: string; userId: string; email: string; name: string; userCode?: string }): Promise<{ data: any; error: Error | null }> => {
            try {
                const { headers, masterToken } = await getAdminFetchConfig();

                const response = await fetch(EDGE_FUNCTION_URL, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        action: 'provision_tenant_admin',
                        payload,
                        ...(masterToken ? { master_token: masterToken } : {})
                    })
                });

                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    const errorMsg = data.error || data.message || data.msg || 'Falha ao provisionar admin';
                    throw new Error(errorMsg);
                }
                return { data, error: null };
            } catch (e: any) {
                console.error("Admin provisionTenantAdmin error:", e);
                return { data: null, error: e };
            }
        }
    }
};

// ⛔ adminSupabase was removed intentionally.
// Use adminAuthProxy.admin.* for auth operations and supabase.from(...) for DB calls.
