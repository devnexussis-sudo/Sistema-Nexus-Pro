
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
    options: QueryOptions<T> & { keepPreviousData?: boolean } = {}
): QueryResult<T> {
    const key = Array.isArray(queryKey) ? queryKey.join(':') : queryKey;

    const {
        enabled = true,
        retry = 1,
        staleTime = DEFAULT_STALE_TIME,
        onSuccess,
        onError,
        refetchOnWindowFocus = false,
        refetchOnReconnect = false,
        keepPreviousData = false
    } = options;

    const previousData = useRef<T | undefined>(undefined);

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

    // Sync previousData ref
    useEffect(() => {
        if (state.data !== undefined) {
            previousData.current = state.data;
        }
    }, [state.data]);

    // 🔒 Circuit Breaker Refs
    const isMounted = useRef(true);
    const isFetchingRef = useRef(false);
    const retryCount = useRef(0);
    const abortControllerRef = useRef<AbortController | null>(null);
    const enabledRef = useRef(enabled);
    const queryFnRef = useRef(queryFn);

    useEffect(() => { enabledRef.current = enabled; }, [enabled]);
    useEffect(() => { queryFnRef.current = queryFn; }, [queryFn]);

    const fetchData = async (forceRefetch = false): Promise<void> => {
        if (isFetchingRef.current) return;
        if (!enabledRef.current && !forceRefetch) return;

        const cached = queryCache.get(key);
        const isStale = !cached || (Date.now() - cached.timestamp > staleTime);

        if (cached?.data && !isStale && !forceRefetch) {
            if (state.data !== cached.data) {
                setState(prev => ({ ...prev, data: cached.data, isLoading: false, isFetching: false, status: 'success' }));
            }
            return;
        }

        const isPromiseStale = cached?.promiseTimestamp && (Date.now() - cached.promiseTimestamp > 15000);
        if (cached?.promise && !isPromiseStale) {
            try {
                const data = await cached.promise;
                if (isMounted.current) {
                    setState(prev => ({ ...prev, data, isLoading: false, isFetching: false, status: 'success', error: null }));
                }
                return;
            } catch { 
                const c = queryCache.get(key);
                if (c) { c.promise = undefined; c.promiseTimestamp = undefined; }
            }
        }

        isFetchingRef.current = true;
        if (abortControllerRef.current) {
            abortControllerRef.current.abort('New fetch started');
        }
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        if (isMounted.current) {
            setState(prev => ({ 
                ...prev, 
                isLoading: keepPreviousData ? (!prev.data && !previousData.current) : !prev.data, 
                isFetching: true, 
                status: 'loading' 
            }));
        }

        try {
            const promise = queryFnRef.current(signal);
            queryCache.set(key, {
                data: cached?.data,
                timestamp: cached?.timestamp || 0,
                promise,
                promiseTimestamp: Date.now()
            });

            const data = await promise;
            const timestamp = Date.now();
            queryCache.set(key, { data, timestamp });
            try {
                localStorage.setItem(`NEXUS_CACHE_${key}`, JSON.stringify({ data, timestamp }));
            } catch { /* noop */ }

            if (isMounted.current) {
                setState({ data, isLoading: false, isFetching: false, error: null, status: 'success' });
                retryCount.current = 0;
                onSuccess?.(data);
            }
        } catch (err: any) {
            const c = queryCache.get(key);
            if (c) { c.promise = undefined; c.promiseTimestamp = undefined; }

            const isAbort = err?.name === 'AbortError' || err?.message?.includes('AbortError') || err?.message?.includes('Aborted');
            if (isAbort) return;

            if (retryCount.current < retry) {
                retryCount.current++;
                const delay = Math.min(1000 * Math.pow(2, retryCount.current), 15000);
                setTimeout(() => {
                    if (isMounted.current && !isFetchingRef.current) fetchData(true);
                }, delay);
                return;
            }

            if (isMounted.current) {
                setState(prev => ({ ...prev, isLoading: false, isFetching: false, error: err, status: 'error' }));
                onError?.(err);
            }
        } finally {
            isFetchingRef.current = false;
        }
    };

    useEffect(() => {
        isMounted.current = true;
        isFetchingRef.current = false;
        retryCount.current = 0;

        // When key changes, if keepPreviousData is false, we clear current data
        if (!keepPreviousData) {
            const cached = queryCache.get(key);
            if (!cached) {
                setState(prev => ({ ...prev, data: undefined, isLoading: enabled, isFetching: enabled, status: 'idle' }));
            }
        } else {
            // If keepPreviousData is true, we keep the state.data (which is the data from the previous key)
            // but we might want to trigger a loading state if not in cache
            const cached = queryCache.get(key);
            if (!cached) {
                setState(prev => ({ ...prev, isLoading: enabled && !prev.data, isFetching: enabled, status: 'loading' }));
            }
        }

        if (enabled) fetchData();

        const handleInvalidation = (e: any) => {
            const targetKey = e.detail?.key;
            if (targetKey === '*') {
                // Full cache purge requested (e.g. on auth change) — clear ALL in-memory entries
                queryCache.clear();
                setTimeout(() => { if (isMounted.current) fetchData(true); }, 50);
            } else if (!targetKey || key.startsWith(targetKey)) {
                setTimeout(() => { if (isMounted.current) fetchData(true); }, 50);
            }
        };

        window.addEventListener('NEXUS_QUERY_INVALIDATE', handleInvalidation);
        window.addEventListener('focus', () => { if (refetchOnWindowFocus && isMounted.current) fetchData(); });
        window.addEventListener('online', () => { if (refetchOnReconnect && isMounted.current) fetchData(); });

        return () => {
            isMounted.current = false;
            isFetchingRef.current = false;
            if (abortControllerRef.current) abortControllerRef.current.abort('Component unmounted');
            window.removeEventListener('NEXUS_QUERY_INVALIDATE', handleInvalidation);
        };
    }, [key, enabled, keepPreviousData]);

    const refetch = async () => {
        isFetchingRef.current = false;
        await fetchData(true);
    };

    const invalidate = () => {
        const cached = queryCache.get(key);
        if (cached) cached.timestamp = 0;
        isFetchingRef.current = false;
        fetchData(true);
    };

    return {
        data: state.data ?? (keepPreviousData ? (previousData.current as T) : undefined),
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
    clearAll: () => {
        queryCache.clear();
        try {
            const keysToRemove: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith('NEXUS_CACHE_')) keysToRemove.push(k);
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));
        } catch(e) {}
        window.dispatchEvent(new CustomEvent('NEXUS_QUERY_INVALIDATE', { detail: { key: '' } }));
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
