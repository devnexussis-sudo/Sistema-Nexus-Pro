
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
const adminAuthProxy = {
    admin: {
        createUser: async (attributes: any) => {
            console.log('🛡️ Secure Proxy: Creating User via Backend API...');
            const response = await fetch('/api/admin-users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create_user', payload: attributes })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Falha na criação de usuário');
            return data;
        },
        deleteUser: async (userId: string) => {
            console.log('🛡️ Secure Proxy: Deleting User via Backend API...');
            const response = await fetch('/api/admin-users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete_user', payload: { userId } })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Falha ao deletar usuário');
            return data;
        },
        listUsers: async () => {
            const response = await fetch('/api/admin-users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'list_users' })
            });
            const data = await response.json();
            return data; // Supabase retorna { data: [], error: null }
        },
        updateUserById: async (userId: string, updates: any) => {
            const response = await fetch('/api/admin-users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'update_user', payload: { userId, updates } })
            });
            const data = await response.json();
            return data;
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
