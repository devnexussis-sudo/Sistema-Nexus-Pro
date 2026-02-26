// src/lib/supabaseClient.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('🚨 CRITICAL: Supabase URL or ANON KEY missing!');
}

const safeUrl = supabaseUrl ?? 'https://placeholder.supabase.co';
const safeKey = supabaseAnonKey ?? 'placeholder';

// ---------------------------------------------------------------------
// Lazy Client / Demanded Session Check
// Somente verifica sessão quando o ensureValidSession é chamado.
// ---------------------------------------------------------------------
export async function ensureValidSession(): Promise<boolean> {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error || !session) {
            console.log('--- TESTE DE FLUXO --- Sem sessão, tentando refresh...');
            const { error: refreshError } = await supabase.auth.refreshSession();

            if (refreshError) {
                console.error('--- TESTE DE FLUXO --- Falha ao dar refresh:', refreshError);
                return false;
            }
            return true;
        }

        return true;
    } catch (err: any) {
        console.error('--- TESTE DE FLUXO --- Erro no ensureValidSession:', err);
        return false;
    }
}

// ---------------------------------------------------------------------
// Basic createClient with persistence, and intercepted fetches for 
// lazy session validation and flow testing log
// ---------------------------------------------------------------------
export const supabase: SupabaseClient = createClient(safeUrl, safeKey, {
    auth: {
        storageKey: 'nexus_shared_auth',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
    },
    global: {
        fetch: async (url, init) => {
            console.log('--- TESTE DE FLUXO --- Interceptando requisição Supabase:', url);

            // Validate session JUST in time before the database call is finalized
            // Skip validation for auth-related calls (to avoid loops)
            if (typeof url === 'string' && !url.includes('/auth/v1/')) {
                await ensureValidSession();
            }

            return fetch(url, init);
        }
    }
});

// ---------------------------------------------------------------------
// Additional tracking for original from and rpc calls (to trace UI reactivity)
// ---------------------------------------------------------------------
const originalFrom = supabase.from.bind(supabase);
supabase.from = (target: any) => {
    console.log(`--- TESTE DE FLUXO --- Iniciando leitura/escrita em: ${target}`);
    return originalFrom(target);
};

const originalRpc = supabase.rpc.bind(supabase);
supabase.rpc = (fn: any, args?: any, options?: any) => {
    console.log(`--- TESTE DE FLUXO --- Iniciando RPC: ${fn}`);
    return originalRpc(fn, args, options);
};

// ---------------------------------------------------------------------
// Diagnostic Tools
// ---------------------------------------------------------------------
export const supabaseDiagnostics = {
    ping: async () => {
        const start = Date.now();
        const { error } = await supabase.from('users').select('id').limit(1);
        const latency = Date.now() - start;
        if (error) throw error;
        return { success: true, latency, timestamp: new Date().toISOString() };
    },
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

export type { SupabaseClient };
