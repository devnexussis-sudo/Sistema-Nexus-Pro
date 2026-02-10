
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 🛡️ Verificação de Segurança de Ambiente
if (!supabaseUrl || !supabaseAnonKey) {
    console.error('🚨 CRITICAL ERROR: Supabase URL or Anon Key is missing in environment variables!');
}

const safeUrl = supabaseUrl || 'https://placeholder.supabase.co';
const safeKey = supabaseAnonKey || 'placeholder';

// Cliente Padrão (Anon Key)
export const supabase = createClient(safeUrl, safeKey, {
    auth: {
        storageKey: 'nexus_shared_auth',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
});

// 🛡️ Secure Admin Proxy
// Redireciona chamadas AUTH sensíveis para o Backend (/api/admin-users)
// Usa o cliente normal para DADOS (.from), respeitando RLS.
// 🛡️ Secure Admin Proxy
// Redireciona chamadas AUTH sensíveis para o Backend da Vercel
const ADMIN_API_URL = import.meta.env.DEV ? 'https://app.nexusline.com.br/api/admin-users' : '/api/admin-users';

const adminAuthProxy = {
    admin: {
        createUser: async (attributes: any) => {
            console.log('🛡️ Secure Proxy: Creating User via Backend API...');
            try {
                const response = await fetch(ADMIN_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'create_user', payload: attributes })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Falha na criação de usuário (API Error)');
                return data; // { data: { user: ... }, error: null }
            } catch (e: any) {
                console.error("Proxy Create Error:", e);
                return { data: null, error: e };
            }
        },
        deleteUser: async (userId: string) => {
            try {
                const response = await fetch(ADMIN_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'delete_user', payload: { userId } })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Falha ao deletar usuário');
                return data;
            } catch (e: any) {
                return { data: null, error: e };
            }
        },
        listUsers: async () => {
            try {
                const response = await fetch(ADMIN_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'list_users' })
                });
                const data = await response.json();
                if (!response.ok) return { data: { users: [] }, error: data.error || 'API Error' };
                return data; // Supabase retorna { data: { users: [] }, error: null }
            } catch (e: any) {
                console.error("Proxy List Error:", e);
                return { data: { users: [] }, error: e };
            }
        },
        updateUserById: async (userId: string, updates: any) => {
            try {
                const response = await fetch(ADMIN_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'update_user', payload: { userId, updates } })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Falha ao atualizar usuário');
                return data;
            } catch (e: any) {
                return { data: null, error: e };
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
