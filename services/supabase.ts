
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

const SUPABASE_URL = 'https://esrwwaoirlhcptbxtlsu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzcnd3YW9pcmxoY3B0Ynh0bHN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MTAwOTksImV4cCI6MjA4NjA4NjA5OX0.HOzS5m8CBiZ1PVvYkePKp8Lu20dl4ymomPnxPQrBA5c';

// 🛡️ Mobile-Grade In-Process Mutex
const lockQueue: Record<string, Promise<unknown>> = {};

const processLock = async <R>(name: string, acquireTimeout: number, fn: () => Promise<R>): Promise<R> => {
    const previousOperation = lockQueue[name] || Promise.resolve();
    const timeoutMs = acquireTimeout > 0 ? acquireTimeout : 10000;
    let timeoutId: any;

    const currentOperation = (async () => {
        try {
            await Promise.race([
                previousOperation.catch(() => { }),
                new Promise((_, reject) => {
                    timeoutId = setTimeout(() => reject(new Error(`⚠️ Lock Timeout: ${name}`)), timeoutMs);
                })
            ]);
            return await fn();
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    })();

    lockQueue[name] = currentOperation.catch(() => { });
    return currentOperation as Promise<R>;
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        lock: processLock as any,
    },
});

// ─── 🛡️ Diagnóstico e Persistência Agressiva ───────────────────

supabase.auth.onAuthStateChange((event, session) => {
    console.log(`[Mobile Auth] 🔑 Evento: ${event}`);
    if (event === 'TOKEN_REFRESHED') {
        console.log('[Mobile Auth] ✨ Token renovado com sucesso!');
    }
    if (!session && event !== 'SIGNED_OUT') {
        console.warn('[Mobile Auth] 🚨 Sessão perdida ou falha no refresh!', { event });
    }
});

/**
 * 💓 AppState Heartbeat
 * Sincroniza a sessão sempre que o app volta para o foreground.
 */
AppState.addEventListener('change', async (nextAppState) => {
    if (nextAppState === 'active') {
        console.log('[Mobile Heartbeat] 💓 App voltou para o foreground. Validando sessão...');
        try {
            const { data: { session }, error } = await supabase.auth.getSession();
            if (error) {
                console.error('[Mobile Heartbeat] ❌ Erro ao validar sessão:', error);
                return;
            }
            if (!session) {
                console.warn('[Mobile Heartbeat] ⚠️ Sessão nula. Tentando refresh...');
                await supabase.auth.refreshSession();
            } else {
                console.log('[Mobile Heartbeat] ✅ Conexão íntegra.');
            }
        } catch (err) {
            console.error('[Mobile Heartbeat] 💥 Exceção fatal:', err);
        }
    }
});

export const BUCKET_NAME = 'nexus-files';
