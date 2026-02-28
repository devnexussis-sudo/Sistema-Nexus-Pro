
import { useState, useEffect, useRef } from 'react';

// 🧠 Global Query Cache (Singleton)
const queryCache = new Map<string, { data: any; timestamp: number; promise?: Promise<any>; promiseTimestamp?: number }>();

// ⚙️ Default Options
const DEFAULT_STALE_TIME = 1000 * 60 * 5; // 5 minutes

interface QueryOptions<T> {
    enabled?: boolean;
    retry?: number;
    staleTime?: number;
    cacheTime?: number;
    onSuccess?: (data: T) => void;
    onError?: (error: Error) => void;
    refetchOnWindowFocus?: boolean;
    refetchOnReconnect?: boolean;
}

interface QueryResult<T> {
    data: T | undefined;
    isLoading: boolean;
    isFetching: boolean;
    isError: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
    invalidate: () => void;
}

/**
 * 🛡️ Nexus Query Engine v2 — Circuit Breaker Edition
 * 
 * Key fixes over v1:
 * - isFetchingRef: hard mutex prevents concurrent fetches from same hook instance
 * - AbortErrors do NOT auto-retry (they mean the component unmounted — stop fetching!)
 * - enabledRef: reads latest `enabled` value in async closure without re-running effect
 * - No enqueueFetch: removed the global queue that caused cascading delays
 */
export function useQuery<T>(
    queryKey: string | string[],
    queryFn: (signal: AbortSignal) => Promise<T>,
    options: QueryOptions<T> = {}
): QueryResult<T> {
    const key = Array.isArray(queryKey) ? queryKey.join(':') : queryKey;

    const {
        enabled = true,
        retry = 1, // Reduced from 2 to limit cascading
        staleTime = DEFAULT_STALE_TIME,
        onSuccess,
        onError,
        refetchOnWindowFocus = false,
        refetchOnReconnect = false
    } = options;

    // 💾 Persistência Local Helper
    const loadFromStorage = (): { data: T; timestamp: number } | null => {
        try {
            const item = localStorage.getItem(`NEXUS_CACHE_${key}`);
            if (item) return JSON.parse(item);
        } catch { /* noop */ }
        return null;
    };

    const [state, setState] = useState<{
        data: T | undefined;
        isLoading: boolean;
        isFetching: boolean;
        error: Error | null;
        status: 'idle' | 'loading' | 'success' | 'error';
    }>(() => {
        // 1. Memory cache
        const cached = queryCache.get(key);
        if (cached?.data) {
            const isStale = (Date.now() - cached.timestamp > staleTime);
            return { data: cached.data as T, isLoading: false, isFetching: isStale, error: null, status: 'success' };
        }

        // 2. Disk cache
        const stored = loadFromStorage();
        if (stored?.data) {
            queryCache.set(key, { data: stored.data, timestamp: stored.timestamp });
            return { data: stored.data as T, isLoading: false, isFetching: true, error: null, status: 'success' };
        }

        // 3. No data
        return { data: undefined, isLoading: enabled, isFetching: enabled, error: null, status: 'idle' };
    });

    // 🔒 Circuit Breaker Refs
    const isMounted = useRef(true);
    const isFetchingRef = useRef(false);          // Hard mutex — prevents concurrent fetches
    const retryCount = useRef(0);
    const abortControllerRef = useRef<AbortController | null>(null);
    const enabledRef = useRef(enabled);
    const queryFnRef = useRef(queryFn);

    // Keep refs updated without causing re-renders or effect re-runs
    useEffect(() => { enabledRef.current = enabled; }, [enabled]);
    useEffect(() => { queryFnRef.current = queryFn; }, [queryFn]);

    // 🔄 Fetch Logic — stable, uses refs internally
    const fetchData = async (forceRefetch = false): Promise<void> => {
        // ── Circuit Breaker ─────────────────────────────────────────
        if (isFetchingRef.current) {
            console.log(`[NexusQuery] 🔒 Blocked concurrent fetch: ${key}`);
            return;
        }
        if (!enabledRef.current && !forceRefetch) return;

        const cached = queryCache.get(key);
        const isStale = !cached || (Date.now() - cached.timestamp > staleTime);

        // Cache is fresh — serve from memory, no network
        if (cached?.data && !isStale && !forceRefetch) {
            if (state.data !== cached.data) {
                setState(prev => ({ ...prev, data: cached.data, isLoading: false, isFetching: false, status: 'success' }));
            }
            return;
        }

        // Request deduplication — if a promise is already in flight, attach to it
        const isPromiseStale = cached?.promiseTimestamp && (Date.now() - cached.promiseTimestamp > 15000);
        if (cached?.promise && !isPromiseStale) {
            console.log(`[NexusQuery] ♻️ Reusing in-flight request: ${key}`);
            try {
                const data = await cached.promise;
                if (isMounted.current) {
                    setState(prev => ({ ...prev, data, isLoading: false, isFetching: false, status: 'success', error: null }));
                }
            } catch { /* The original caller will handle errors */ }
            return;
        }

        // ── Start Fetch ─────────────────────────────────────────────
        isFetchingRef.current = true;

        // Abort any previous hanging request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort('New fetch started');
        }
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        console.log(`[NexusQuery] 🟢 Fetching: ${key}`);
        if (isMounted.current) {
            setState(prev => ({ ...prev, isLoading: !prev.data, isFetching: true, status: 'loading' }));
        }

        try {
            const promise = queryFnRef.current(signal);

            // Store in-flight promise for deduplication
            queryCache.set(key, {
                data: cached?.data,
                timestamp: cached?.timestamp || 0,
                promise,
                promiseTimestamp: Date.now()
            });

            const data = await promise;
            console.log(`[NexusQuery] ✅ Success: ${key}`);

            // Update cache
            const timestamp = Date.now();
            queryCache.set(key, { data, timestamp });
            try {
                localStorage.setItem(`NEXUS_CACHE_${key}`, JSON.stringify({ data, timestamp }));
            } catch { /* Storage quota exceeded — not critical */ }

            if (isMounted.current) {
                setState({ data, isLoading: false, isFetching: false, error: null, status: 'success' });
                retryCount.current = 0;
                onSuccess?.(data);
            }
        } catch (err: any) {
            // Clear in-flight promise
            const c = queryCache.get(key);
            if (c) { c.promise = undefined; c.promiseTimestamp = undefined; }

            // ⚠️ CRITICAL: AbortError means the component unmounted or a new fetch started.
            // DO NOT retry on AbortError — that is the loop source.
            const isAbort = err?.name === 'AbortError' || err?.message?.includes('AbortError') || err?.message?.includes('Aborted');
            if (isAbort) {
                console.log(`[NexusQuery] 🛑 Fetch aborted (normal): ${key}`);
                // Do NOT retry, do NOT update state with error
                return;
            }

            if (retryCount.current < retry) {
                retryCount.current++;
                const delay = Math.min(1000 * Math.pow(2, retryCount.current), 15000);
                console.warn(`[NexusQuery] 🔁 Retry ${retryCount.current}/${retry} for ${key} in ${delay}ms`);
                setTimeout(() => {
                    if (isMounted.current && !isFetchingRef.current) fetchData(true);
                }, delay);
                return;
            }

            console.error(`[NexusQuery] ❌ Failed: ${key}`, err?.message);
            if (isMounted.current) {
                setState(prev => ({ ...prev, isLoading: false, isFetching: false, error: err, status: 'error' }));
                onError?.(err);
            }
        } finally {
            // ⚠️ CRITICAL: Always release the mutex
            if (isMounted.current) {
                isFetchingRef.current = false;
            }
        }
    };

    useEffect(() => {
        isMounted.current = true;
        isFetchingRef.current = false; // Reset on every key/enabled change
        retryCount.current = 0;

        if (enabled) fetchData();

        // 👂 Global Invalidation Listener
        const handleInvalidation = (e: any) => {
            const targetKey = e.detail?.key;
            if (!targetKey || key.startsWith(targetKey) || targetKey === '*') {
                // Small delay to avoid firing during a render cycle
                setTimeout(() => { if (isMounted.current) fetchData(true); }, 50);
            }
        };

        window.addEventListener('NEXUS_QUERY_INVALIDATE', handleInvalidation);

        const handleFocus = () => { if (refetchOnWindowFocus && isMounted.current) fetchData(); };
        window.addEventListener('focus', handleFocus);

        const handleOnline = () => { if (refetchOnReconnect && isMounted.current) fetchData(); };
        window.addEventListener('online', handleOnline);

        return () => {
            isMounted.current = false;
            isFetchingRef.current = false; // Release mutex on unmount
            if (abortControllerRef.current) {
                abortControllerRef.current.abort('Component unmounted');
            }
            window.removeEventListener('NEXUS_QUERY_INVALIDATE', handleInvalidation);
            window.removeEventListener('focus', handleFocus);
            window.removeEventListener('online', handleOnline);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, enabled]); // Only primitive values — stable, no object refs

    const refetch = async () => {
        isFetchingRef.current = false; // Force unlock before manual refetch
        await fetchData(true);
    };

    const invalidate = () => {
        const cached = queryCache.get(key);
        if (cached) cached.timestamp = 0;
        isFetchingRef.current = false;
        fetchData(true);
    };

    return {
        data: state.data,
        isLoading: state.isLoading,
        isFetching: state.isFetching,
        isError: !!state.error,
        error: state.error,
        refetch,
        invalidate
    };
}

// 🧹 Cache Helper
export const queryClient = {
    invalidateQueries: (keyPrefix: string) => {
        for (const key of queryCache.keys()) {
            if (key.startsWith(keyPrefix) || key === keyPrefix) {
                const cached = queryCache.get(key);
                if (cached) cached.timestamp = 0;
            }
        }
        window.dispatchEvent(new CustomEvent('NEXUS_QUERY_INVALIDATE', { detail: { key: keyPrefix } }));
    },
    setQueryData: (key: string, data: any) => {
        queryCache.set(key, { data, timestamp: Date.now() });
    },
    getQueryData: (key: string) => {
        return queryCache.get(key)?.data;
    },
    clear: () => {
        queryCache.clear();
    }
};
