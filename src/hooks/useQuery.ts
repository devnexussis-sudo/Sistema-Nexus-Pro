import { useState, useEffect, useCallback } from 'react';

interface QueryOptions<T> {
    enabled?: boolean;
    retry?: number;
    staleTime?: number;
    onSuccess?: (data: T) => void;
    onError?: (error: Error) => void;
}

interface QueryResult<T> {
    data: T | null;
    isLoading: boolean;
    isError: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
}

/**
 * 🛡️ Nexus Resilience Hook: Uma versão simplificada do TanStack Query
 * focada em estabilidade, retry automático e gerenciamento de estado "inquebrável".
 */
export function useQuery<T>(
    queryKey: string,
    queryFn: () => Promise<T>,
    options: QueryOptions<T> = {}
): QueryResult<T> {
    const {
        enabled = true,
        retry = 3,
        staleTime = 0,
        onSuccess,
        onError
    } = options;

    const [data, setData] = useState<T | null>(null);
    const [isLoading, setIsLoading] = useState(enabled);
    const [isError, setIsError] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    // 🛡️ Previne vazamento de memória e race conditions
    useEffect(() => {
        let isMounted = true;
        const abortController = new AbortController();

        const fetchData = async (attempt = 0) => {
            if (!enabled) return;

            if (attempt === 0) setIsLoading(true);

            try {
                // Se abortado, para imediatamente
                if (abortController.signal.aborted) return;

                const result = await queryFn();

                if (isMounted) {
                    setData(result);
                    setIsLoading(false);
                    if (onSuccess && typeof onSuccess === 'function') onSuccess(result);
                }
            } catch (err: any) {
                if (abortController.signal.aborted) return;

                // Retry Logic (Exponential Backoff)
                if (attempt < (retry || 3)) {
                    const delay = Math.pow(2, attempt) * 1000;
                    setTimeout(() => {
                        if (isMounted) fetchData(attempt + 1);
                    }, delay);
                    return;
                }

                if (isMounted) {
                    setIsError(true);
                    setError(err);
                    setIsLoading(false);
                    if (onError && typeof onError === 'function') onError(err);
                }
            }
        };

        fetchData();

        return () => {
            isMounted = false;
            abortController.abort();
        };
    }, [queryKey, enabled]); // Re-run when key or enabled changes

    const refetch = async () => {
        setIsLoading(true);
        try {
            const result = await queryFn();
            setData(result);
            setIsLoading(false);
        } catch (err) {
            setIsError(true);
            setIsLoading(false);
        }
    };

    return { data, isLoading, isError, error, refetch };
}
