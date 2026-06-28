/**
 * 🚀 Bootstrap Service — Cold Start & Push Notification Handler
 * 
 * Handles the critical path from app launch to functional UI:
 * ┌────────────────────────────────────────────────────────────────┐
 * │ 1. Cold start: splash → smoke test → auth → UI (<2s target)  │
 * │ 2. Push tap: splash → smoke test → auth → fetch OS → navigate │
 * │ 3. Background wake: reconnect → cache → UI (<800ms target)   │
 * │ 4. Offline: open app → show cached data → sync when online   │
 * └────────────────────────────────────────────────────────────────┘
 * 
 * REQUIREMENTS (Section 2 & 5):
 * - If bootstrap >1s: overlay "Sincronizando...", never error
 * - If offline: "Aguardando conexão." Retry auto on reconnect
 * - Push cold start target: <2s from tap to OS visible
 * - Background wake target: <800ms
 * 
 * CRITICAL FIX: Skip smoke test if no cached session (first login).
 * Reason: smoke test before auth is pointless if user hasn't logged in yet.
 * The login page directly calls supabase.auth.signIn which goes through
 * the resilient customFetch anyway.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import {
    CLARO_FIX_FLAGS,
    runSmokeTestWithRetry,
    pingSupabase,
    detectCarrier,
} from './connection-diagnostics';

// ─── Bootstrap State ─────────────────────────────────────────────────────────

export type BootstrapStatus = 
    | 'IDLE'
    | 'RUNNING'
    | 'SMOKE_TEST'
    | 'AUTH_CHECK'
    | 'FETCHING_OS'
    | 'SYNCING'
    | 'READY'
    | 'OFFLINE'
    | 'FAILED';

interface BootstrapResult {
    status: BootstrapStatus;
    authenticated: boolean;
    orderData?: any;
    durationMs: number;
    error?: string;
}

const LAST_ACTIVITY_KEY = '@nexus:last_activity_ts';

class BootstrapServiceClass {
    private _status: BootstrapStatus = 'IDLE';
    private _statusListeners: Set<(status: BootstrapStatus) => void> = new Set();
    private _isRunning = false;

    get status() { return this._status; }

    /** Subscribe to bootstrap status changes (for UI overlay) */
    onStatusChange(callback: (status: BootstrapStatus) => void): () => void {
        this._statusListeners.add(callback);
        callback(this._status);
        return () => this._statusListeners.delete(callback);
    }

    private setStatus(status: BootstrapStatus) {
        this._status = status;
        this._statusListeners.forEach(cb => {
            try { cb(status); } catch { /* silent */ }
        });
    }

    /**
     * Full bootstrap for cold start or push notification tap.
     * 
     * Flow:
     * 1. Check if session exists (fast, from cache)
     * 2. If no session → return NOT_AUTHENTICATED immediately (skip smoke test!)
     * 3. If session exists → smoke test → refresh session → fetch OS if needed
     * 
     * CRITICAL RULE: Never run smoke test if user hasn't logged in yet.
     * The login page's supabase.auth.signIn already goes through 
     * the resilient customFetch with carrier-aware timeouts.
     */
    async init(options?: { osId?: string }): Promise<BootstrapResult> {
        if (this._isRunning) {
            console.log('[Bootstrap] ⏳ Already running, waiting...');
            return new Promise<BootstrapResult>((resolve) => {
                const check = setInterval(() => {
                    if (!this._isRunning) {
                        clearInterval(check);
                        resolve({
                            status: this._status,
                            authenticated: this._status === 'READY',
                            durationMs: 0,
                        });
                    }
                }, 100);
                setTimeout(() => { clearInterval(check); resolve({ status: 'FAILED', authenticated: false, durationMs: 15000, error: 'Bootstrap timeout' }); }, 15000);
            });
        }

        this._isRunning = true;
        const start = Date.now();
        this.setStatus('RUNNING');

        try {
            // ─── Step 0: Quick session check (from cache — no network) ───
            // If no cached session exists, skip EVERYTHING and go straight 
            // to login. The smoke test is pointless for first-time users.
            this.setStatus('AUTH_CHECK');
            const { data: { session: cachedSession } } = await supabase.auth.getSession();

            if (!cachedSession) {
                console.log('[Bootstrap] 🔓 No cached session. Skipping smoke test — directing to login.');
                this.setStatus('FAILED');
                this._isRunning = false;
                return {
                    status: 'FAILED',
                    authenticated: false,
                    durationMs: Date.now() - start,
                    error: 'No session — login required',
                };
            }

            // ─── Step 1: Smoke Test (only for returning users) ───────────
            if (CLARO_FIX_FLAGS.ENABLE_SMOKE_TEST) {
                this.setStatus('SMOKE_TEST');
                const carrier = await detectCarrier();
                console.log(`[Bootstrap] 📡 Carrier: ${carrier.carrier}/${carrier.networkType}`);

                const smokeResult = await runSmokeTestWithRetry(2);

                if (!smokeResult.success) {
                    console.warn(`[Bootstrap] ⚠️ Smoke test failed: ${smokeResult.errorType} — ${smokeResult.errorMessage}`);
                    // We HAVE a cached session, so operate in offline mode
                    console.log('[Bootstrap] 📦 Cached session found. Operating in offline mode.');
                    this.setStatus('OFFLINE');
                    this._isRunning = false;
                    return {
                        status: 'OFFLINE',
                        authenticated: true,
                        durationMs: Date.now() - start,
                        error: `Smoke test failed: ${smokeResult.errorType}`,
                    };
                }
            }

            // ─── Step 2: Refresh session if needed ───────────────────────
            this.setStatus('AUTH_CHECK');
            // Session exists from Step 0, verify it's still valid
            const isExpired = cachedSession.expires_at 
                ? (cachedSession.expires_at * 1000) < Date.now() 
                : false;
            
            if (isExpired) {
                console.log('[Bootstrap] 🔄 Token expired, refreshing...');
                const { error: refreshError } = await supabase.auth.refreshSession();
                if (refreshError) {
                    console.warn('[Bootstrap] ⚠️ Token refresh failed:', refreshError.message);
                    // Don't block — the user is still "authenticated" with cached data
                    // The next API call will trigger auto-refresh anyway
                }
            }

            // ─── Step 3: Fetch OS Data if push deep link (Section 5.2) ───
            let orderData: any = undefined;
            if (options?.osId) {
                this.setStatus('FETCHING_OS');
                console.log(`[Bootstrap] 📋 Fetching OS ${options.osId} for push deep link...`);

                try {
                    const { data, error } = await supabase
                        .from('orders')
                        .select('*, customers(*)')
                        .eq('id', options.osId)
                        .single();

                    if (!error && data) {
                        orderData = data;
                        // Cache it for instant rendering
                        await AsyncStorage.setItem(
                            `@cache:order_details_${options.osId}`,
                            JSON.stringify({ data, timestamp: Date.now(), ttl: 5 * 60 * 1000 })
                        );
                        console.log(`[Bootstrap] ✅ OS ${options.osId} fetched and cached`);
                    } else {
                        console.warn(`[Bootstrap] ⚠️ OS ${options.osId} fetch failed:`, error?.message);
                    }
                } catch (e) {
                    console.warn(`[Bootstrap] ⚠️ OS ${options.osId} fetch exception:`, e);
                    // Non-fatal: navigation will fetch from cache or retry
                }
            }

            // ─── Step 4: Mark as Ready ───────────────────────────────────
            await this.touchLastActivity();
            this.setStatus('READY');
            this._isRunning = false;

            const durationMs = Date.now() - start;
            console.log(`[Bootstrap] ✅ Bootstrap complete in ${durationMs}ms`);

            return {
                status: 'READY',
                authenticated: true,
                orderData,
                durationMs,
            };

        } catch (error: any) {
            console.error('[Bootstrap] ❌ Fatal error:', error);
            this.setStatus('FAILED');
            this._isRunning = false;
            return {
                status: 'FAILED',
                authenticated: false,
                durationMs: Date.now() - start,
                error: error?.message || 'Unknown bootstrap error',
            };
        }
    }

    /**
     * Quick bootstrap for foreground return (Section 2.2).
     * If >90s since last activity, validates session before releasing UI.
     * Target: <800ms
     */
    async quickResume(): Promise<boolean> {
        const lastActivity = await this.getLastActivity();
        const timeSinceActivity = Date.now() - lastActivity;

        if (timeSinceActivity < 90_000) {
            // Less than 90s — no need to revalidate
            return true;
        }

        console.log(`[Bootstrap] ⏰ ${Math.round(timeSinceActivity / 1000)}s since last activity. Running quick resume...`);
        this.setStatus('SYNCING');

        try {
            // Quick ping + session check
            const [pingOk, sessionResult] = await Promise.all([
                pingSupabase(5_000),
                supabase.auth.getSession(),
            ]);

            if (!pingOk) {
                console.warn('[Bootstrap] ⚠️ Quick resume: ping failed, but session might be cached');
            }

            if (!sessionResult.data?.session) {
                console.warn('[Bootstrap] ⚠️ Quick resume: no session, forcing refresh');
                await supabase.auth.refreshSession();
            }

            await this.touchLastActivity();
            this.setStatus('READY');
            return true;

        } catch (e) {
            console.warn('[Bootstrap] ⚠️ Quick resume failed:', e);
            this.setStatus('READY'); // Don't block UI — will retry on next call
            return true; // Allow UI to proceed, will reconnect in background
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    async touchLastActivity(): Promise<void> {
        try {
            await AsyncStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
        } catch { /* silent */ }
    }

    async getLastActivity(): Promise<number> {
        try {
            const val = await AsyncStorage.getItem(LAST_ACTIVITY_KEY);
            return val ? parseInt(val, 10) : 0;
        } catch {
            return 0;
        }
    }
}

export const BootstrapService = new BootstrapServiceClass();
