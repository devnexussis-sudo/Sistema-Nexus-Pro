import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storageKey: 'nexus_shared_auth',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
});

// Cliente administrativo para criação de usuários no Auth Oficial
export const adminSupabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        storageKey: 'nexus_admin_safe',
        autoRefreshToken: false,
        persistSession: false
    }
});

// 🛡️ Nexus Public Client: Otimizado para visualização pública sem Auth/Locks
export const publicSupabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    }
});
