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

async function getUserToken(): Promise<string | null> {
    // 1. Tenta pegar a sessão ativa oficial do Supabase Auth
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) return session.access_token;
    } catch {}

    // 2. Tenta obter o Master Session Token via SessionStorage (isolado por aba)
    try {
        const masterToken = SessionStorage.get<string>('master_session_token');
        if (masterToken && typeof masterToken === 'string' && masterToken.trim().length > 0) {
            return masterToken.trim();
        }
    } catch {}

    // 3. Tenta extrair token do storage persistido de autenticação ('nexus-line-auth')
    try {
        const rawAuth = sessionStorage.getItem('nexus-line-auth') || localStorage.getItem('nexus-line-auth');
        if (rawAuth) {
            const parsed = JSON.parse(rawAuth);
            const token = parsed?.access_token || parsed?.currentSession?.access_token || parsed?.session?.access_token;
            if (token && typeof token === 'string') return token.trim();
        }
    } catch {}

    // 4. Fallbacks em sessionStorage e localStorage brutos para master_session_token
    try {
        const directToken = sessionStorage.getItem('master_session_token') || localStorage.getItem('master_session_token');
        if (directToken) {
            try {
                const parsed = JSON.parse(directToken);
                if (typeof parsed === 'string' && parsed.trim().length > 0) return parsed.trim();
            } catch {
                if (directToken.trim().length > 0) return directToken.trim();
            }
        }
    } catch {}

    // 5. Varredura por chaves dinâmicas com prefixo de sessão (ex: session-xxx_master_session_token)
    try {
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && key.endsWith('_master_session_token')) {
                const raw = sessionStorage.getItem(key);
                if (raw) {
                    try {
                        const parsed = JSON.parse(raw);
                        if (typeof parsed === 'string' && parsed.trim().length > 0) return parsed.trim();
                    } catch {
                        if (raw.trim().length > 0) return raw.trim();
                    }
                }
            }
        }
    } catch {}

    return null;
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
                const token = await getUserToken();
                if (!token) throw new Error('User not authenticated');

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
                if (!token) throw new Error('User not authenticated');

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
                if (!token) throw new Error('User not authenticated');

                const response = await fetch(EDGE_FUNCTION_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ action: 'list_users' })
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
                if (!token) throw new Error('User not authenticated');

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
        },

        provisionTenantAdmin: async (payload: { tenantId: string; userId: string; email: string; name: string; userCode?: string }): Promise<{ data: any; error: Error | null }> => {
            try {
                const token = await getUserToken();
                if (!token) throw new Error('User not authenticated');

                const response = await fetch(EDGE_FUNCTION_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        action: 'provision_tenant_admin',
                        payload
                    })
                });

                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Failed to provision tenant admin');
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
