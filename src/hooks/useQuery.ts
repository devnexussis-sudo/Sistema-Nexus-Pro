
import { useState, useEffect, useRef } from 'react';

// 🧠 Global Query Cache (Singleton)
const queryCache = new Map<string, { data: any; timestamp: number; promise?: Promise<any>; promiseTimestamp?: number }>();

// ⚙️ Default Options
const DEFAULT_STALE_TIME = 1000 * 60 * 5; // 5 minutes
const DEFAULT_CACHE_TIME = 1000 * 60 * 30; // 30 minutes

interface QueryOptions<T> {
    enabled?: boolean;
    retry?: number;
    staleTime?: number; // Time in ms before data is considered stale
    cacheTime?: number; // Time in ms before data is garbage collected
    onSuccess?: (data: T) => void;
    onError?: (error: Error) => void;
    refetchOnWindowFocus?: boolean; // TODO: Implement focus refetching
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
 * 🛡️ Nexus Query Engine (Lightweight React Query)
 * Features:
 * - Global Caching (Singleton)
 * - Request Deduplication
 * - Stale-While-Revalidate
 * - Background Updates
 * - Retry Logic with Exponential Backoff
 */
export function useQuery<T>(
    queryKey: string | string[],
    queryFn: () => Promise<T>,
    options: QueryOptions<T> = {}
): QueryResult<T> {
    const key = Array.isArray(queryKey) ? queryKey.join(':') : queryKey;

    const {
        enabled = true,
        retry = 2,
        staleTime = DEFAULT_STALE_TIME,
        onSuccess,
        onError
    } = options;

    // 💾 Persistência Local Helper
    const loadFromStorage = () => {
        try {
            const item = localStorage.getItem(`NEXUS_CACHE_${key}`);
            if (item) {
                const parsed = JSON.parse(item);
                // Validar se cache é muito antigo (ex: 24h) para forçar limpeza? 
                // Por enquanto, confiamos no staleTime para refetch, mas usamos os dados antigos para display imediato.
                return parsed;
            }
        } catch (e) {
            return null;
        }
    };

    const [state, setState] = useState<{
        data: T | undefined;
        isLoading: boolean;
        isFetching: boolean;
        error: Error | null;
        status: 'idle' | 'loading' | 'success' | 'error';
    }>(() => {
        // 1. Tentar Memória (Mais rápido e atualizado na sessão)
        const cached = queryCache.get(key);
        if (cached) {
            const isStale = (Date.now() - cached.timestamp > staleTime);
            return {
                data: cached.data as T,
                isLoading: false, // Temos dados!
                isFetching: isStale, // Se for velho, vamos buscar background
                error: null,
                status: 'success'
            };
        }

        // 2. Tentar Disco/Storage (Persistência entre F5)
        const stored = loadFromStorage();
        if (stored) {
            // Hidratar memória com disco
            queryCache.set(key, {
                data: stored.data,
                timestamp: stored.timestamp,
                promise: undefined
            });

            const isStale = (Date.now() - stored.timestamp > staleTime);
            return {
                data: stored.data as T,
                isLoading: false, // Temos dados instantâneos!
                isFetching: true, // Sempre refetch do storage para garantir frescor
                error: null,
                status: 'success'
            };
        }

        // 3. Sem dados
        return {
            data: undefined,
            isLoading: enabled,
            isFetching: enabled,
            error: null,
            status: 'idle'
        };
    });

    const isMounted = useRef(true);
    const retryCount = useRef(0);

    // 🔄 Fetch Logic
    const fetchData = async (forceRefetch = false) => {
        if (!enabled && !forceRefetch) return;

        const cached = queryCache.get(key);
        const isStale = !cached || (Date.now() - cached.timestamp > staleTime);

        // Se tiver dados em cache e não estiver stale, e não for forçado, retorna
        if (cached && !isStale && !forceRefetch) {
            if (state.data !== cached.data) {
                setState(prev => ({ ...prev, data: cached.data, isLoading: false, isFetching: false, status: 'success' }));
            }
            return;
        }

        // 🛡️ Request Deduplication (com anti-deadlock)
        const isPromiseStale = cached?.promiseTimestamp && (Date.now() - cached.promiseTimestamp > 45000); // 45s timeout para acomodar retries do fetch

        if (cached?.promise && !isPromiseStale) {
            console.log(`[NexusQuery] ♻️ Reusing request: ${key}`);
            setState(prev => ({ ...prev, isFetching: true }));
            try {
                const data = await cached.promise;
                if (isMounted.current) {
                    setState(prev => ({ ...prev, data, isLoading: false, isFetching: false, status: 'success', error: null }));
                }
            } catch (err) {
                // Ignore error from deduplication
            }
            return;
        }

        // Se promessa era velha (zumbi), ignoramos e iniciamos nova
        if (isPromiseStale && cached?.promise) {
            console.warn(`[NexusQuery] 🧟 Zumbi Promise detectada em ${key}. Ignorando e refetching...`);
            cached.promise = undefined;
        }

        // Start Fetch
        console.log(`[NexusQuery] 🟢 Fetching: ${key}`);
        setState(prev => ({
            ...prev,
            isLoading: !prev.data,
            isFetching: true,
            status: 'loading'
        }));

        try {
            const promise = queryFn();

            // Store promise in cache
            if (cached) {
                cached.promise = promise;
                cached.promiseTimestamp = Date.now();
            } else {
                queryCache.set(key, { data: undefined as any, timestamp: 0, promise, promiseTimestamp: Date.now() });
            }

            const data = await promise;
            console.log(`[NexusQuery] ✅ Success: ${key}`);

            // Update Cache (Memory + Disk)
            const timestamp = Date.now();
            queryCache.set(key, { data, timestamp, promise: undefined });
            try {
                localStorage.setItem(`NEXUS_CACHE_${key}`, JSON.stringify({ data, timestamp }));
            } catch (e) {
                console.warn('[NexusQuery] Failed to persist cache', e);
            }

            if (isMounted.current) {
                setState({
                    data,
                    isLoading: false,
                    isFetching: false,
                    error: null,
                    status: 'success'
                });
                retryCount.current = 0;
                onSuccess?.(data);
            }
        } catch (err: any) {
            // Remove promise from cache to allow retry
            const currentCache = queryCache.get(key);
            if (currentCache) currentCache.promise = undefined;

            if (retryCount.current < retry) {
                retryCount.current++;
                const delay = Math.min(1000 * Math.pow(2, retryCount.current), 30000);
                setTimeout(() => {
                    if (isMounted.current) fetchData(true);
                }, delay);
                return;
            }

            if (isMounted.current) {
                setState(prev => ({
                    ...prev,
                    isLoading: false,
                    isFetching: false,
                    error: err,
                    status: 'error'
                }));
                onError?.(err);
            }
        }
    };

    useEffect(() => {
        isMounted.current = true;
        fetchData();

        // 👂 Global Invalidation Listener
        const handleInvalidation = (e: any) => {
            const targetKey = e.detail?.key;
            if (!targetKey || key.startsWith(targetKey) || targetKey === '*') {
                fetchData(true);
            }
        };

        window.addEventListener('NEXUS_QUERY_INVALIDATE', handleInvalidation);

        // 💓 Window Focus Refetch (Big Tech Standard)
        const handleFocus = () => {
            fetchData(); // fetchData already checks for staleTime internally
        };
        window.addEventListener('focus', handleFocus);

        return () => {
            isMounted.current = false;
            window.removeEventListener('NEXUS_QUERY_INVALIDATE', handleInvalidation);
            window.removeEventListener('focus', handleFocus);
        };
    }, [key, enabled]); // Re-run when key or enabled changes

    const refetch = async () => {
        await fetchData(true);
    };

    const invalidate = () => {
        const cached = queryCache.get(key);
        if (cached) cached.timestamp = 0; // Mark as stale immediately
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
        // Iterate over keys and invalidate matching ones in cache
        for (const key of queryCache.keys()) {
            if (key.startsWith(keyPrefix) || key === keyPrefix) {
                const cached = queryCache.get(key);
                if (cached) cached.timestamp = 0;
            }
        }
        // Notify all active hooks with this prefix to refetch
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
