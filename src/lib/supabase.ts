// src/lib/supabase.ts
// Thin wrapper that re‑exports the singleton client and provides a public client.
import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import type { DbUserInsert } from '../types/database';

// Export the main singleton for the application
export { supabase };

// ---------------------------------------------------------------------
// Public client – no persisted session, no auto‑refresh
// Used specifically for public RPCs (e.g., public quote approval)
// ---------------------------------------------------------------------
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('🚨 CRITICAL: Supabase URL or ANON KEY missing!');
}

const safeUrl = supabaseUrl ?? 'https://placeholder.supabase.co';
const safeKey = supabaseAnonKey ?? 'placeholder';

export const publicSupabase = createClient(safeUrl, safeKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
    },
});

// ---------------------------------------------------------------------
// 🛡️ adminAuthProxy — Secure Proxy for Admin Auth operations.
// Redirects sensitive calls to a secure Edge Function.
// DOES NOT use service_role key on frontend. DOES NOT bypass RLS.
// ---------------------------------------------------------------------

const EDGE_FUNCTION_URL = import.meta.env.VITE_EDGE_FUNCTION_URL ||
    `${safeUrl}/functions/v1/admin-operations`;

/**
 * Gets the JWT token for the currently authenticated user
 */
async function getUserToken(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
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
        }
    }
};

// ⛔ adminSupabase was removed intentionally.
// Use adminAuthProxy.admin.* for auth operations and supabase.from(...) for DB calls.
