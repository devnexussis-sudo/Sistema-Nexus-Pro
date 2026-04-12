/**
 * 🛡️ Network Resilience Service — Enterprise Grade
 * 
 * Provides production-grade network resilience for mobile environments:
 * - Fetch with configurable timeout + AbortController support
 * - Retry with exponential backoff + cancellation
 * - Priority-based concurrency limiter
 * - Circuit breaker pattern
 * - Connection quality awareness
 * - Full observability
 */

import NetInfo from '@react-native-community/netinfo';

// ─── Configuration ───────────────────────────────────────────────────────────
const DEFAULT_TIMEOUT_MS = 15_000;       // 15s default timeout
const RETRY_BASE_DELAY_MS = 1_000;       // 1s base for exponential backoff
const RETRY_MAX_DELAY_MS = 30_000;       // 30s max backoff
const RETRY_MAX_ATTEMPTS = 3;

// ─── Priority Concurrency Lanes ──────────────────────────────────────────────
// Separate lanes prevent uploads from starving critical API calls
type RequestPriority = 'critical' | 'normal' | 'upload';

interface ConcurrencyLane {
    maxConcurrent: number;
    active: number;
    queue: Array<{ resolve: () => void }>;
}

const lanes: Record<RequestPriority, ConcurrencyLane> = {
    critical: { maxConcurrent: 3, active: 0, queue: [] },  // Auth, status updates
    normal:   { maxConcurrent: 4, active: 0, queue: [] },  // Data queries
    upload:   { maxConcurrent: 2, active: 0, queue: [] },  // File uploads
};

const acquireSlot = (priority: RequestPriority = 'normal'): Promise<void> => {
    const lane = lanes[priority];
    if (lane.active < lane.maxConcurrent) {
        lane.active++;
        return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
        lane.queue.push({ resolve });
    });
};

const releaseSlot = (priority: RequestPriority = 'normal') => {
    const lane = lanes[priority];
    lane.active = Math.max(0, lane.active - 1);
    if (lane.queue.length > 0 && lane.active < lane.maxConcurrent) {
        lane.active++;
        const next = lane.queue.shift();
        next?.resolve();
    }
};

// ─── Circuit Breaker ─────────────────────────────────────────────────────────
/**
 * Circuit Breaker prevents request storms when the backend is down.
 * States: CLOSED (normal) → OPEN (blocked) → HALF_OPEN (testing)
 * 
 * After N consecutive failures, the circuit opens and blocks all requests
 * for a cooldown period. After cooldown, one test request is allowed through.
 * If it succeeds, circuit closes. If it fails, circuit reopens.
 */
type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

const CIRCUIT_FAILURE_THRESHOLD = 5;     // Open after 5 consecutive failures
const CIRCUIT_COOLDOWN_MS = 30_000;      // 30s cooldown before half-open
const CIRCUIT_SUCCESS_THRESHOLD = 2;     // Close after 2 consecutive successes in half-open

let circuitState: CircuitState = 'CLOSED';
let consecutiveFailures = 0;
let consecutiveSuccesses = 0;
let circuitOpenedAt = 0;

const recordSuccess = () => {
    consecutiveFailures = 0;
    if (circuitState === 'HALF_OPEN') {
        consecutiveSuccesses++;
        if (consecutiveSuccesses >= CIRCUIT_SUCCESS_THRESHOLD) {
            circuitState = 'CLOSED';
            consecutiveSuccesses = 0;
            console.log('[CircuitBreaker] ✅ Circuit CLOSED — backend recovered');
        }
    }
};

const recordFailure = () => {
    consecutiveSuccesses = 0;
    consecutiveFailures++;
    if (circuitState === 'HALF_OPEN') {
        // Failed during test — reopen
        circuitState = 'OPEN';
        circuitOpenedAt = Date.now();
        console.warn('[CircuitBreaker] 🔴 Circuit re-OPENED — test request failed');
    } else if (consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD && circuitState === 'CLOSED') {
        circuitState = 'OPEN';
        circuitOpenedAt = Date.now();
        console.warn(`[CircuitBreaker] 🔴 Circuit OPENED — ${consecutiveFailures} consecutive failures`);
    }
};

const checkCircuit = (): boolean => {
    if (circuitState === 'CLOSED') return true;
    if (circuitState === 'OPEN') {
        if (Date.now() - circuitOpenedAt >= CIRCUIT_COOLDOWN_MS) {
            circuitState = 'HALF_OPEN';
            console.log('[CircuitBreaker] 🟡 Circuit HALF_OPEN — testing...');
            return true; // Allow one test request
        }
        return false; // Blocked
    }
    // HALF_OPEN — allow through for testing
    return true;
};

// ─── Cancellation Token ──────────────────────────────────────────────────────
/**
 * Lightweight cancellation mechanism compatible with both
 * AbortController (for fetch) and manual promise cancellation.
 */
export class CancellationToken {
    private _cancelled = false;
    private _abortController = new AbortController();

    get cancelled(): boolean { return this._cancelled; }
    get signal(): AbortSignal { return this._abortController.signal; }

    cancel() {
        this._cancelled = true;
        this._abortController.abort();
    }
}

// ─── Timeout Wrapper with Cancellation ───────────────────────────────────────
export const withTimeout = <T>(
    promise: Promise<T>,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
    label: string = 'request',
    cancellation?: CancellationToken
): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise<never>((_, reject) => {
        // Check if already cancelled
        if (cancellation?.cancelled) {
            reject(new Error(`[NetworkResilience] ❌ Cancelled: ${label}`));
            return;
        }

        timeoutId = setTimeout(() => {
            reject(new Error(`[NetworkResilience] ⏱️ Timeout (${timeoutMs}ms) for: ${label}`));
        }, timeoutMs);

        // Listen for cancellation
        if (cancellation) {
            cancellation.signal.addEventListener('abort', () => {
                clearTimeout(timeoutId);
                reject(new Error(`[NetworkResilience] ❌ Cancelled: ${label}`));
            });
        }
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
        clearTimeout(timeoutId);
    });
};

// ─── Retry with Exponential Backoff + Cancellation ───────────────────────────
export const withRetry = async <T>(
    fn: () => Promise<T>,
    options: {
        maxAttempts?: number;
        baseDelay?: number;
        maxDelay?: number;
        label?: string;
        shouldRetry?: (error: any) => boolean;
        cancellation?: CancellationToken;
    } = {}
): Promise<T> => {
    const {
        maxAttempts = RETRY_MAX_ATTEMPTS,
        baseDelay = RETRY_BASE_DELAY_MS,
        maxDelay = RETRY_MAX_DELAY_MS,
        label = 'operation',
        shouldRetry = () => true,
        cancellation,
    } = options;

    let lastError: any;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        // Abort if cancelled before attempt
        if (cancellation?.cancelled) {
            throw new Error(`[NetworkResilience] ❌ Cancelled before attempt ${attempt}: ${label}`);
        }

        try {
            const result = await fn();
            recordSuccess();
            return result;
        } catch (error: any) {
            lastError = error;

            // Don't retry if cancelled
            if (cancellation?.cancelled) {
                throw new Error(`[NetworkResilience] ❌ Cancelled during attempt ${attempt}: ${label}`);
            }

            if (attempt === maxAttempts || !shouldRetry(error)) {
                recordFailure();
                throw error;
            }

            recordFailure();

            // Exponential backoff with jitter
            const delay = Math.min(
                baseDelay * Math.pow(2, attempt - 1) + Math.random() * 500,
                maxDelay
            );

            console.warn(
                `[NetworkResilience] ⚡ ${label} attempt ${attempt}/${maxAttempts} failed, retrying in ${Math.round(delay)}ms:`,
                error?.message || error
            );

            // Cancellable delay
            await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(resolve, delay);
                if (cancellation) {
                    cancellation.signal.addEventListener('abort', () => {
                        clearTimeout(timer);
                        reject(new Error(`[NetworkResilience] ❌ Cancelled during backoff: ${label}`));
                    });
                }
            });
        }
    }

    throw lastError;
};

// ─── Resilient Call (timeout + concurrency + retry + circuit breaker) ─────────
export const resilientCall = async <T>(
    fn: () => Promise<T>,
    options: {
        timeoutMs?: number;
        maxRetries?: number;
        label?: string;
        priority?: RequestPriority;
        skipConcurrencyLimit?: boolean;
        cancellation?: CancellationToken;
    } = {}
): Promise<T> => {
    const {
        timeoutMs = DEFAULT_TIMEOUT_MS,
        maxRetries = RETRY_MAX_ATTEMPTS,
        label = 'api-call',
        priority = 'normal',
        skipConcurrencyLimit = false,
        cancellation,
    } = options;

    // Circuit breaker check
    if (!checkCircuit()) {
        throw new Error(`[CircuitBreaker] 🔴 Circuit OPEN — request blocked: ${label}. Will retry in ${Math.round((CIRCUIT_COOLDOWN_MS - (Date.now() - circuitOpenedAt)) / 1000)}s`);
    }

    if (!skipConcurrencyLimit) {
        await acquireSlot(priority);
    }

    try {
        return await withRetry(
            () => withTimeout(fn(), timeoutMs, label, cancellation),
            {
                maxAttempts: maxRetries,
                label,
                cancellation,
                shouldRetry: (error) => {
                    const msg = error?.message || '';
                    // Never retry cancelled requests
                    if (msg.includes('Cancelled')) return false;
                    // Don't retry auth errors or client errors
                    if (msg.includes('401') || msg.includes('403') || msg.includes('JWT')) return false;
                    // Don't retry if circuit is open
                    if (msg.includes('Circuit OPEN')) return false;
                    // Retry network errors and timeouts
                    return msg.includes('Timeout') || msg.includes('TypeError') || msg.includes('Net') || msg.includes('fetch');
                },
            }
        );
    } finally {
        if (!skipConcurrencyLimit) {
            releaseSlot(priority);
        }
    }
};

// ─── Connection Quality Check ────────────────────────────────────────────────
export const isNetworkAvailable = async (): Promise<boolean> => {
    try {
        const state = await NetInfo.fetch();
        return !!state.isConnected;
    } catch {
        return false;
    }
};

// ─── Throttle Utility ────────────────────────────────────────────────────────
export const createThrottle = (minIntervalMs: number) => {
    let lastCall = 0;
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;

    const throttled = (fn: () => void) => {
        const now = Date.now();
        const elapsed = now - lastCall;

        if (pendingTimer) {
            clearTimeout(pendingTimer);
            pendingTimer = null;
        }

        if (elapsed >= minIntervalMs) {
            lastCall = now;
            fn();
        } else {
            // Schedule trailing call
            pendingTimer = setTimeout(() => {
                lastCall = Date.now();
                pendingTimer = null;
                fn();
            }, minIntervalMs - elapsed);
        }
    };

    // Allow cleanup of pending timers
    throttled.cancel = () => {
        if (pendingTimer) {
            clearTimeout(pendingTimer);
            pendingTimer = null;
        }
    };

    return throttled;
};

// ─── Debounce Utility ────────────────────────────────────────────────────────
export const createDebounce = (delayMs: number) => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const debounced = (fn: () => void) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            fn();
        }, delayMs);
    };

    // Allow cleanup of pending timers
    debounced.cancel = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };

    return debounced;
};

// ─── Stats (for observability) ───────────────────────────────────────────────
export const getNetworkStats = () => ({
    lanes: {
        critical: { active: lanes.critical.active, queued: lanes.critical.queue.length, max: lanes.critical.maxConcurrent },
        normal:   { active: lanes.normal.active,   queued: lanes.normal.queue.length,   max: lanes.normal.maxConcurrent },
        upload:   { active: lanes.upload.active,    queued: lanes.upload.queue.length,   max: lanes.upload.maxConcurrent },
    },
    circuitBreaker: {
        state: circuitState,
        consecutiveFailures,
        consecutiveSuccesses,
        openedAt: circuitOpenedAt > 0 ? new Date(circuitOpenedAt).toISOString() : null,
    },
});

// ─── Reset (for testing/logout) ──────────────────────────────────────────────
export const resetNetworkState = () => {
    circuitState = 'CLOSED';
    consecutiveFailures = 0;
    consecutiveSuccesses = 0;
    circuitOpenedAt = 0;
    // Drain all queued requests
    for (const lane of Object.values(lanes)) {
        lane.active = 0;
        lane.queue.forEach(q => q.resolve());
        lane.queue = [];
    }
};
