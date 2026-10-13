/**
 * 🛡️ Connection Diagnostics Service — Claro Brasil Fix
 * 
 * Provides carrier-aware connectivity diagnostics and smoke tests.
 * Detects Claro CGNAT/DNS/TLS issues before they break the app.
 * 
 * Key responsibilities:
 * ┌───────────────────────────────────────────────────────────┐
 * │ 1. Carrier detection (Claro, Vivo, TIM, WiFi)            │
 * │ 2. Smoke test: validate HTTPS→Supabase before auth       │
 * │ 3. Detailed error classification (DNS, TLS, timeout)      │
 * │ 4. DNS fallback via 1.1.1.1/8.8.8.8 (flag-gated)         │
 * │ 5. Connection event logging for observability             │
 * └───────────────────────────────────────────────────────────┘
 */

import NetInfo from '@react-native-community/netinfo';

// ─── Feature Flags (Section 0.5 compliance) ─────────────────────────────────
export const CLARO_FIX_FLAGS = {
    /** Enable carrier-specific timeout adjustments */
    ENABLE_CARRIER_DETECTION: true,
    /** Enable DNS resolution fallback via public resolvers. Only enable if 0.1-0.4 fail. */
    ENABLE_DNS_FALLBACK: false,
    /** Use extended timeouts (8s/12s/18s) instead of aggressive (4.5s/6s/10s) */
    ENABLE_EXTENDED_TIMEOUTS: true,
    /** Run smoke test before authentication */
    ENABLE_SMOKE_TEST: true,
    /** Enable keepalive ping every 45s (Section 1.4) */
    ENABLE_KEEPALIVE_PING: true,
};

// ─── Carrier Detection ──────────────────────────────────────────────────────

export type CarrierType = 'claro' | 'vivo' | 'tim' | 'oi' | 'wifi' | 'unknown';

interface CarrierInfo {
    carrier: CarrierType;
    networkType: string;        // 'wifi' | '4g' | '3g' | '2g' | 'unknown'
    isClaro: boolean;
    /** Claro CGNAT typically drops idle TCP in ~60s. Others are 120s+. */
    idleTimeoutEstimateMs: number;
    /** Recommended first-attempt fetch timeout for this carrier */
    recommendedTimeoutMs: number;
}

let _cachedCarrierInfo: CarrierInfo | null = null;
let _carrierCacheTime = 0;
const CARRIER_CACHE_TTL = 30_000; // Re-detect every 30s

/**
 * Detects the current carrier/network type.
 * Uses NetInfo cellularGeneration + carrier string.
 * Result is cached for 30s to avoid overhead.
 */
export async function detectCarrier(): Promise<CarrierInfo> {
    const now = Date.now();
    if (_cachedCarrierInfo && (now - _carrierCacheTime) < CARRIER_CACHE_TTL) {
        return _cachedCarrierInfo;
    }

    try {
        const state = await NetInfo.fetch();
        const details = state.details as any;

        let carrier: CarrierType = 'unknown';
        let networkType = 'unknown';

        if (state.type === 'wifi') {
            carrier = 'wifi';
            networkType = 'wifi';
        } else if (state.type === 'cellular') {
            networkType = details?.cellularGeneration || 'unknown';

            // Carrier detection via NetInfo details (Android/iOS)
            const carrierName = (details?.carrier || '').toLowerCase();
            if (carrierName.includes('claro') || carrierName.includes('americel') || carrierName.includes('brt')) {
                carrier = 'claro';
            } else if (carrierName.includes('vivo') || carrierName.includes('telefonica')) {
                carrier = 'vivo';
            } else if (carrierName.includes('tim')) {
                carrier = 'tim';
            } else if (carrierName.includes('oi') || carrierName.includes('telemar')) {
                carrier = 'oi';
            }
        }

        const isClaro = carrier === 'claro';

        const info: CarrierInfo = {
            carrier,
            networkType,
            isClaro,
            // Claro drops idle TCP in ~60s, others in ~120s+
            idleTimeoutEstimateMs: isClaro ? 55_000 : 110_000,
            // Claro CGNAT needs more time for initial TLS handshake
            recommendedTimeoutMs: isClaro ? 8_000 : 6_000,
        };

        _cachedCarrierInfo = info;
        _carrierCacheTime = now;
        return info;

    } catch (e) {
        // Fallback: assume worst case (Claro-like)
        const fallback: CarrierInfo = {
            carrier: 'unknown',
            networkType: 'unknown',
            isClaro: false,
            idleTimeoutEstimateMs: 55_000,
            recommendedTimeoutMs: 8_000,
        };
        _cachedCarrierInfo = fallback;
        _carrierCacheTime = now;
        return fallback;
    }
}

/** Synchronous getter (returns cached or worst-case defaults) */
export function getCarrierInfoSync(): CarrierInfo {
    return _cachedCarrierInfo || {
        carrier: 'unknown',
        networkType: 'unknown',
        isClaro: false,
        idleTimeoutEstimateMs: 55_000,
        recommendedTimeoutMs: 8_000,
    };
}

// ─── Error Classification ────────────────────────────────────────────────────

export type ConnectionErrorType = 'DNS' | 'TLS' | 'TIMEOUT' | 'NETWORK' | 'SERVER' | 'UNKNOWN';

interface DiagnosticResult {
    success: boolean;
    errorType?: ConnectionErrorType;
    errorMessage?: string;
    latencyMs?: number;
    carrier: CarrierType;
    networkType: string;
    timestamp: number;
}

/**
 * Classifies a network error into DNS, TLS, TIMEOUT, NETWORK, or SERVER.
 * This enables targeted logging for Claro-specific issues.
 */
export function classifyError(error: any): ConnectionErrorType {
    const msg = (error?.message || error?.toString() || '').toLowerCase();

    // DNS resolution failures
    if (msg.includes('getaddrinfo') || msg.includes('enotfound') || msg.includes('dns') ||
        msg.includes('name or service not known') || msg.includes('could not resolve host')) {
        return 'DNS';
    }

    // TLS/SSL handshake failures (common on Claro with SNI issues)
    if (msg.includes('ssl') || msg.includes('tls') || msg.includes('certificate') ||
        msg.includes('handshake') || msg.includes('secure connection')) {
        return 'TLS';
    }

    // Timeouts
    if (msg.includes('timeout') || msg.includes('aborted') || msg.includes('aborterror') ||
        msg.includes('timed_out') || msg.includes('etimedout') || msg.includes('deadline')) {
        return 'TIMEOUT';
    }

    // Generic network errors
    if (msg.includes('network') || msg.includes('econnreset') || msg.includes('econnrefused') ||
        msg.includes('epipe') || msg.includes('connection') || msg.includes('socket') ||
        msg.includes('fetch') || msg.includes('typeerror')) {
        return 'NETWORK';
    }

    // HTTP server errors
    if (msg.includes('503') || msg.includes('504') || msg.includes('502') || msg.includes('500')) {
        return 'SERVER';
    }

    return 'UNKNOWN';
}

// ─── Smoke Test (Section 0.5) ────────────────────────────────────────────────

const SUPABASE_URL = 'https://esrwwaoirlhcptbxtlsu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzcnd3YW9pcmxoY3B0Ynh0bHN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MTAwOTksImV4cCI6MjA4NjA4NjA5OX0.HOzS5m8CBiZ1PVvYkePKp8Lu20dl4ymomPnxPQrBA5c';

/**
 * Smoke test: validates that HTTPS→Supabase is reachable.
 * Must succeed before proceeding to authentication.
 * 
 * On Claro, this is the first request after app cold start.
 * If it fails, we log detailed diagnostics (DNS, TLS, timeout).
 * 
 * @returns DiagnosticResult with success, errorType, latencyMs
 */
export async function runSmokeTest(timeoutMs?: number): Promise<DiagnosticResult> {
    const carrierInfo = await detectCarrier();
    const effectiveTimeout = timeoutMs || (CLARO_FIX_FLAGS.ENABLE_EXTENDED_TIMEOUTS
        ? (carrierInfo.isClaro ? 12_000 : 8_000)
        : 6_000);

    const start = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Accept': 'application/json',
            },
            signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const latencyMs = Date.now() - start;

        // Any HTTP response (even 4xx) means the connection was established
        const result: DiagnosticResult = {
            success: true,
            latencyMs,
            carrier: carrierInfo.carrier,
            networkType: carrierInfo.networkType,
            timestamp: Date.now(),
        };

        console.log(`[Diagnostics] ✅ Smoke test passed in ${latencyMs}ms (${carrierInfo.carrier}/${carrierInfo.networkType})`);
        return result;

    } catch (error: any) {
        clearTimeout(timeoutId);
        const latencyMs = Date.now() - start;
        const errorType = classifyError(error);

        const result: DiagnosticResult = {
            success: false,
            errorType,
            errorMessage: error?.message || 'Unknown error',
            latencyMs,
            carrier: carrierInfo.carrier,
            networkType: carrierInfo.networkType,
            timestamp: Date.now(),
        };

        console.error(
            `[Diagnostics] ❌ Smoke test FAILED on ${carrierInfo.carrier}/${carrierInfo.networkType}: ` +
            `${errorType} — ${error?.message} (${latencyMs}ms)`
        );

        return result;
    }
}

/**
 * Run smoke test with retry. For cold start, allows 2 attempts with increasing timeouts.
 * If first attempt fails on Claro, second attempt uses a longer timeout (18s).
 * 
 * @returns DiagnosticResult - last attempt result
 */
export async function runSmokeTestWithRetry(maxAttempts: number = 2): Promise<DiagnosticResult> {
    const carrierInfo = await detectCarrier();
    // Claro: 10s → 18s. Others: 8s → 12s.
    const timeouts = carrierInfo.isClaro ? [10_000, 18_000] : [8_000, 12_000];

    let lastResult: DiagnosticResult | null = null;

    for (let i = 0; i < maxAttempts; i++) {
        const timeout = timeouts[Math.min(i, timeouts.length - 1)];
        lastResult = await runSmokeTest(timeout);

        if (lastResult.success) return lastResult;

        if (i < maxAttempts - 1) {
            console.warn(`[Diagnostics] ⚡ Smoke test attempt ${i + 1}/${maxAttempts} failed. Retrying with ${timeout}ms timeout...`);
            // Small delay before retry to allow TCP state reset
            await new Promise(r => setTimeout(r, 1500));
        }
    }

    return lastResult!;
}

/**
 * Lightweight connectivity ping. Used for keepalive and bootstrap.
 * Faster than smoke test (no headers, just verifies TCP+TLS is alive).
 */
export async function pingSupabase(timeoutMs: number = 8_000): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/?limit=1`, {
            method: 'GET',
            headers: { 'apikey': SUPABASE_ANON_KEY },
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return true;
    } catch {
        clearTimeout(timeoutId);
        return false;
    }
}

// ─── Retryable Error Detection (Section 3.2-3.3) ────────────────────────────

/**
 * Determines if an error should be retried.
 * Follows Section 3.2-3.3 rules:
 * - Retry: ECONNRESET, ETIMEDOUT, Network request failed, WebSocket 1006, 503, 504
 * - Retry: 408 (Request Timeout), 429 (Rate Limit) with Retry-After
 * - NEVER retry: 4xx (except 408, 429)
 * - NEVER retry: cancelled requests
 */
export function isRetryableError(error: any): boolean {
    const msg = (error?.message || error?.toString() || '').toLowerCase();

    // Never retry cancellations
    if (msg.includes('cancelled') || msg.includes('canceled')) return false;

    // Never retry auth errors
    if (msg.includes('401') || msg.includes('403') || msg.includes('jwt')) return false;

    // Never retry validation errors
    if (msg.includes('422') || msg.includes('400')) return false;

    // Retry-worthy errors (Section 3.2)
    const retryPatterns = [
        'econnreset', 'etimedout', 'network request failed',
        'websocket closed', '1006', 'socket hang up',
        '503', '504', '502', '408', '429',
        'timeout', 'aborted', 'aborterror',
        'fetch', 'typeerror', 'network',
    ];

    return retryPatterns.some(p => msg.includes(p));
}

/**
 * Extract Retry-After header value from 429 errors.
 * Returns delay in ms, or null if not present.
 */
export function getRetryAfterMs(error: any): number | null {
    const retryAfter = error?.response?.headers?.get?.('retry-after') ||
                       error?.retryAfter;
    if (!retryAfter) return null;

    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) return seconds * 1000;
    return null;
}
