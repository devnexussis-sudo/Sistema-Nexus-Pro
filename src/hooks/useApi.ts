import { useState, useCallback } from 'react';

interface UseApiOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

export function useApi<T = any>() {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const request = useCallback(async (
    apiFunc: () => Promise<T>,
    options?: UseApiOptions<T>,
    retries = 3,
    backoff = 300
  ): Promise<T | null> => {
    setLoading(true);
    setError(null);

    let attempt = 0;
    while (attempt < retries) {
      try {
        const result = await apiFunc();
        setData(result);
        if (options?.onSuccess) options.onSuccess(result);
        setLoading(false);
        return result;
      } catch (err: any) {
        attempt++;
        console.warn(`API call failed (attempt ${attempt}/${retries}):`, err.message);
        if (attempt >= retries) {
          setError(err);
          if (options?.onError) options.onError(err);
          setLoading(false);
          // Fallback alert, can be replaced by react-toastify
          alert(`Erro: ${err.message || 'Falha na comunicação com o servidor'}`);
          throw err;
        }
        await new Promise(resolve => setTimeout(resolve, backoff * Math.pow(2, attempt - 1)));
      }
    }
    return null;
  }, []);

  return { data, loading, error, request };
}
