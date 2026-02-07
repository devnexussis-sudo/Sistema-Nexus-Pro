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

    const executeFetch = useCallback(async (attempt = 0) => {
        if (!enabled) return;

        try {
            if (attempt === 0) setIsLoading(true);
            setIsError(false);

            const result = await queryFn();

            setData(result);
            if (onSuccess) onSuccess(result);
            setIsLoading(false);
        } catch (err: any) {
            console.error(`[useQuery] Falha ao carregar ${queryKey} (Tentativa ${attempt + 1}/${retry + 1}):`, err);

            if (attempt < retry) {
                // Exponential backoff
                const delay = Math.pow(2, attempt) * 1000;
                setTimeout(() => executeFetch(attempt + 1), delay);
            } else {
                setIsError(true);
                setError(err instanceof Error ? err : new Error(String(err)));
                if (onError) onError(err);
                setIsLoading(false);
            }
        }
    }, [queryFn, enabled, retry, queryKey, onSuccess, onError]);

    useEffect(() => {
        executeFetch();
    }, [queryKey]); // Refetch se a chave mudar

    return {
        data,
        isLoading,
        isError,
        error,
        refetch: () => executeFetch(0)
    };
}
