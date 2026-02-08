import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('🚨 CRITICAL ERROR: Supabase URL or Anon Key is missing in environment variables!');
}

const safeUrl = supabaseUrl || 'https://placeholder.supabase.co';
const safeKey = supabaseAnonKey || 'placeholder';

export const supabase = createClient(safeUrl, safeKey, {
    auth: {
        storageKey: 'nexus_shared_auth',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
});

// Cliente administrativo para criação de usuários no Auth Oficial
export const adminSupabase = createClient(safeUrl, supabaseServiceKey, {
    auth: {
        storageKey: 'nexus_admin_safe',
        autoRefreshToken: false,
        persistSession: false
    }
});

// 🛡️ Nexus Public Client: Otimizado para visualização pública sem Auth/Locks
export const publicSupabase = createClient(safeUrl, safeKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    }
});
