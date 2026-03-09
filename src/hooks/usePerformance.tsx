/**
 * ⚡ Nexus Pro - Performance Optimizations
 * Componentes e hooks otimizados para performance
 */

import { memo, useMemo, useCallback, useRef, useEffect } from 'react';

/**
 * Hook para debounce de valores
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
    const [debouncedValue, setDebouncedValue] = React.useState<T>(value);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);

    return debouncedValue;
}

/**
 * Hook para throttle de funções
 */
export function useThrottle<T extends (...args: any[]) => any>(
    callback: T,
    delay: number = 300
): T {
    const lastRan = useRef(Date.now());

    return useCallback(
        ((...args) => {
            if (Date.now() - lastRan.current >= delay) {
                callback(...args);
                lastRan.current = Date.now();
            }
        }) as T,
        [callback, delay]
    );
}

/**
 * Hook para lazy load de dados
 */
export function useLazyLoad<T>(
    fetchFn: () => Promise<T>,
    dependencies: any[] = []
): {
    data: T | null;
    loading: boolean;
    error: Error | null;
    refetch: () => void;
} {
    const [data, setData] = React.useState<T | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<Error | null>(null);

    const fetch = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await fetchFn();
            setData(result);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Unknown error'));
        } finally {
            setLoading(false);
        }
    }, dependencies);

    return { data, loading, error, refetch: fetch };
}

/**
 * Hook para infinite scroll
 */
export function useInfiniteScroll(
    callback: () => void,
    options: {
        threshold?: number;
        rootMargin?: string;
    } = {}
) {
    const { threshold = 1.0, rootMargin = '0px' } = options;
    const observerRef = useRef<IntersectionObserver | null>(null);

    const lastElementRef = useCallback(
        (node: HTMLElement | null) => {
            if (observerRef.current) observerRef.current.disconnect();

            observerRef.current = new IntersectionObserver(
                (entries) => {
                    if (entries[0].isIntersecting) {
                        callback();
                    }
                },
                { threshold, rootMargin }
            );

            if (node) observerRef.current.observe(node);
        },
        [callback, threshold, rootMargin]
    );

    return lastElementRef;
}

/**
 * Hook para virtual scrolling
 */
export function useVirtualScroll<T>(
    items: T[],
    itemHeight: number,
    containerHeight: number
) {
    const [scrollTop, setScrollTop] = React.useState(0);

    const visibleItems = useMemo(() => {
        const startIndex = Math.floor(scrollTop / itemHeight);
        const endIndex = Math.ceil((scrollTop + containerHeight) / itemHeight);

        return {
            startIndex,
            endIndex,
            items: items.slice(startIndex, endIndex + 1),
            offsetY: startIndex * itemHeight,
            totalHeight: items.length * itemHeight,
        };
    }, [items, itemHeight, containerHeight, scrollTop]);

    const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        setScrollTop(e.currentTarget.scrollTop);
    }, []);

    return { visibleItems, onScroll };
}

/**
 * Componente otimizado para listas longas
 */
interface VirtualListProps<T> {
    items: T[];
    itemHeight: number;
    containerHeight: number;
    renderItem: (item: T, index: number) => React.ReactNode;
    keyExtractor: (item: T) => string;
}

export const VirtualList = memo(<T,>({
    items,
    itemHeight,
    containerHeight,
    renderItem,
    keyExtractor,
}: VirtualListProps<T>) => {
    const { visibleItems, onScroll } = useVirtualScroll(items, itemHeight, containerHeight);

    return (
        <div
            style= {{ height: containerHeight, overflow: 'auto' }
}
            onScroll = { onScroll }
    >
    <div style={{ height: visibleItems.totalHeight, position: 'relative' }}>
        <div style={ { transform: `translateY(${visibleItems.offsetY}px)` } }>
        {
            visibleItems.items.map((item, index) => (
                <div key= { keyExtractor(item) } style = {{ height: itemHeight }} >
            { renderItem(item, visibleItems.startIndex + index) }
            </div>
                    ))}
</div>
    </div>
    </div>
    );
}) as<T>(props: VirtualListProps<T>) => JSX.Element;

VirtualList.displayName = 'VirtualList';

/**
 * HOC para lazy loading de componentes
 */
export function withLazyLoad<P extends object>(
    Component: React.ComponentType<P>,
    LoadingComponent: React.ComponentType = () => <div>Loading...</div>
) {
    return memo((props: P) => {
        const [isVisible, setIsVisible] = React.useState(false);
        const ref = useRef<HTMLDivElement>(null);

        useEffect(() => {
            const observer = new IntersectionObserver(
                ([entry]) => {
                    if (entry.isIntersecting) {
                        setIsVisible(true);
                        observer.disconnect();
                    }
                },
                { threshold: 0.1 }
            );

            if (ref.current) {
                observer.observe(ref.current);
            }

            return () => observer.disconnect();
        }, []);

        return (
            <div ref= { ref } >
            { isVisible?<Component {...props } /> : <LoadingComponent />
    }
      </div>
    );
});
}

/**
 * Hook para memoização de callbacks pesados
 */
export function useStableCallback<T extends (...args: any[]) => any>(callback: T): T {
    const callbackRef = useRef(callback);

    useEffect(() => {
        callbackRef.current = callback;
    }, [callback]);

    return useCallback(((...args) => {
        return callbackRef.current(...args);
    }) as T, []);
}

/**
 * Hook para detectar mudanças e evitar re-renders desnecessários
 */
export function useDeepMemo<T>(value: T): T {
    const ref = useRef<T>(value);
    const signalRef = useRef<number>(0);

    if (!deepEqual(value, ref.current)) {
        ref.current = value;
        signalRef.current += 1;
    }

    return useMemo(() => ref.current, [signalRef.current]);
}

function deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;
    if (typeof a !== 'object') return a === b;

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    return keysA.every(key => deepEqual(a[key], b[key]));
}

// Para uso em componentes React
import * as React from 'react';
