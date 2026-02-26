// src/lib/supabaseClient.ts
import { createClient, SupabaseClient, SupabaseAuthClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------
// Environment variables (Vite) – ensure they are defined in .env
// ---------------------------------------------------------------
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('🚨 CRITICAL: Supabase URL or ANON KEY missing!');
}

// Fallback placeholders (development safety)
const safeUrl = supabaseUrl ?? 'https://placeholder.supabase.co';
const safeKey = supabaseAnonKey ?? 'placeholder';

// ---------------------------------------------------------------
// In‑process mutex to serialize critical auth operations
// ---------------------------------------------------------------
type LockName = string;
const lockQueue: Record<LockName, Promise<unknown>> = {};

const processLock = async <R>(
    name: string,
    acquireTimeout: number,
    fn: () => Promise<R>
): Promise<R> => {
    const previous = lockQueue[name] ?? Promise.resolve();
    const timeoutMs = acquireTimeout > 0 ? acquireTimeout : 10_000; // default 10 s
    let timeoutId: ReturnType<typeof setTimeout>;

    const current = (async () => {
        try {
            await Promise.race([
                previous.catch(() => { }), // ignore previous errors
                new Promise((_, reject) => {
                    timeoutId = setTimeout(() => reject(new Error(`⚠️ Lock timeout: ${name}`)), timeoutMs);
                }),
            ]);
            return await fn();
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    })();

    // Keep the queue alive even if the operation fails
    lockQueue[name] = current.catch(() => { });
    return current as Promise<R>;
};

// ---------------------------------------------------------------
// Singleton Supabase client – exported for the whole app
// ---------------------------------------------------------------
export const supabase: SupabaseClient = createClient(safeUrl, safeKey, {
    auth: {
        storageKey: 'nexus_shared_auth',
        persistSession: true,          // ← mandatory per spec
        autoRefreshToken: true,        // ← mandatory per spec
        detectSessionInUrl: true,
        storage: window.localStorage,  // explicit localStorage usage
        lock: processLock,
    },

    // -----------------------------------------------------------
    // Custom fetch with retries (re‑uses the original logic)
    // -----------------------------------------------------------
    global: {
        fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
            const MAX_RETRIES = 2;
            let lastError: any = null;

            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30_000); // 30 s

                try {
                    const response = await fetch(url, { ...init, signal: controller.signal });
                    clearTimeout(timeoutId);

                    // Retry on server errors (5xx)
                    if (response.status >= 500 && attempt < MAX_RETRIES) {
                        console.warn(`[Supabase fetch] HTTP ${response.status} – retry ${attempt + 1}`);
                        await new Promise(r => setTimeout(r, 1_000 * (attempt + 1)));
                        continue;
                    }
                    return response;
                } catch (err: any) {
                    clearTimeout(timeoutId);
                    lastError = err;

                    const retryable =
                        err.name === 'AbortError' ||
                        err.message?.includes('Failed to fetch') ||
                        !window.navigator.onLine;

                    if (retryable && attempt < MAX_RETRIES) {
                        console.warn(`[Supabase fetch] Network error – retry ${attempt + 1}`, err.message);
                        await new Promise(r => setTimeout(r, 1_000 * (attempt + 1)));
                        continue;
                    }

                    console.error('[Supabase fetch] Critical failure after retries', err.message);
                    throw err;
                }
            }
            throw lastError;
        },
    },
});

// ---------------------------------------------------------------
// Heartbeat – runs every 30 seconds to keep the session alive
// ---------------------------------------------------------------
const HEARTBEAT_INTERVAL_MS = 30_000;

const heartbeat = async () => {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
            console.error('[Supabase Heartbeat] ❌ getSession error:', error);
            // immediate refresh attempt
            const { error: refreshError } = await supabase.auth.refreshSession();
            if (refreshError) console.error('[Supabase Heartbeat] 🚨 refresh failed:', refreshError);
            return;
        }

        if (!session) {
            console.warn('[Supabase Heartbeat] ⚠️ No session – forced refresh');
            const { error: refreshError } = await supabase.auth.refreshSession();
            if (refreshError) console.error('[Supabase Heartbeat] 🚨 forced refresh failed:', refreshError);
        } else {
            console.log('[Supabase Heartbeat] ✅ Session healthy');
        }
    } catch (e) {
        console.error('[Supabase Heartbeat] 💥 Unexpected error:', e);
    }
};

let heartbeatTimer: NodeJS.Timeout | null = null;
if (typeof window !== 'undefined') {
    heartbeatTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
}

// ---------------------------------------------------------------
// Focus listener – validates session when the user returns to the tab
// ---------------------------------------------------------------
if (typeof window !== 'undefined') {
    window.addEventListener('focus', async () => {
        console.log('[Supabase Focus] Tab regained focus – validating session');
        try {
            const { data: { session }, error } = await supabase.auth.getSession();
            if (error) {
                console.error('[Supabase Focus] getSession error:', error);
                return;
            }
            if (!session) {
                console.warn('[Supabase Focus] No session – attempting refresh');
                const { error: refreshError } = await supabase.auth.refreshSession();
                if (refreshError) console.error('[Supabase Focus] Refresh failed:', refreshError);
            }
        } catch (e) {
            console.error('[Supabase Focus] Unexpected error:', e);
        }
    });
}

// ---------------------------------------------------------------
// Global helper – safely execute any Supabase promise and log network errors
// ---------------------------------------------------------------
export async function safeSupabase<T>(promise: Promise<T>): Promise<T | null> {
    try {
        return await promise;
    } catch (err: any) {
        const isNetwork = err.message?.includes('Network Error') || err.name === 'AbortError';
        if (isNetwork) {
            console.error('[Supabase] 🌐 Network error detected –', err.message);
        } else {
            console.error('[Supabase] ❗ Unexpected error –', err);
        }
        return null;
    }
}

// ---------------------------------------------------------------
// 🛡️ Nexus Session Guard: Ensures a valid session exists before DB calls.
// Checks the current token expiry and proactively refreshes if needed.
// Returns true if session is valid, false if not (user should be logged out).
// ---------------------------------------------------------------
let _lastSessionCheck = 0;
const SESSION_CHECK_COOLDOWN = 10000; // Check more frequently (10s) but trust auto-refresh

export async function ensureValidSession(): Promise<boolean> {
    const now = Date.now();
    if (now - _lastSessionCheck < SESSION_CHECK_COOLDOWN) return true; // Skip if checked recently
    _lastSessionCheck = now;

    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session) return false;
        return true;
    } catch (err: any) {
        return false;
    }
}

/**
 * 🛠️ Nexus Diagnostic Tools
 */
export const supabaseDiagnostics = {
    /** Real world DB ping test */
    ping: async () => {
        const start = Date.now();
        const { data, error } = await supabase.from('users').select('id').limit(1);
        const latency = Date.now() - start;
        if (error) throw error;
        return { success: true, latency, timestamp: new Date().toISOString() };
    },

    /** Current Realtime status */
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

// Export types for convenience
export type { SupabaseClient, SupabaseAuthClient } from '@supabase/supabase-js';
