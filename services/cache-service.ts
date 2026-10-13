
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * 🚀 Nexus Smart Cache (Mobile Edition)
 * In-memory first, AsyncStorage second.
 */

interface CacheEntry {
    data: any;
    timestamp: number;
    ttl: number;
}

export class CacheService {
    private static memoryCache: Map<string, CacheEntry> = new Map();
    private static inflight: Map<string, Promise<any>> = new Map();

    static TTL = {
        FAST: 30 * 1000,          // 30s (Realtime stats)
        APP: 5 * 60 * 1000,       // 5m (Standard list load)
        STABLE: 60 * 60 * 1000,   // 1h (Settings/Configs)
    };

    /**
     * Get from memory, fallback to disk (AsyncStorage)
     * Retorna { data, isStale } para sabermos se expirou mas ainda podemos usar em emergência.
     */
    static async getWithStaleInfo<T>(key: string): Promise<{ data: T | null; isStale: boolean }> {
        // 1. Memória
        const entry = this.memoryCache.get(key);
        if (entry) {
            if (Date.now() - entry.timestamp < entry.ttl) {
                return { data: entry.data as T, isStale: false };
            }
            return { data: entry.data as T, isStale: true };
        }

        // 2. Disco
        try {
            const diskData = await AsyncStorage.getItem(`@cache:${key}`);
            if (diskData) {
                const diskEntry: CacheEntry = JSON.parse(diskData);
                this.memoryCache.set(key, diskEntry); // Sobe pra RAM de qualquer jeito
                if (Date.now() - diskEntry.timestamp < diskEntry.ttl) {
                    return { data: diskEntry.data as T, isStale: false };
                }
                return { data: diskEntry.data as T, isStale: true };
            }
        } catch (e) {
            console.warn(`[Cache] Fail reading disk for ${key}`);
        }

        return { data: null, isStale: false };
    }

    static async get<T>(key: string): Promise<T | null> {
        const { data, isStale } = await this.getWithStaleInfo<T>(key);
        return isStale ? null : data;
    }

    /**
     * Save to memory and disk
     */
    static async set(key: string, data: any, ttl: number = this.TTL.APP): Promise<void> {
        const entry: CacheEntry = {
            data,
            timestamp: Date.now(),
            ttl
        };

        this.memoryCache.set(key, entry);

        try {
            await AsyncStorage.setItem(`@cache:${key}`, JSON.stringify(entry));
        } catch (e) {
            console.warn(`[Cache] Fail writing disk for ${key}`);
        }
    }

    /**
     * Invalidate specific key
     */
    static async invalidate(key: string): Promise<void> {
        this.memoryCache.delete(key);
        await AsyncStorage.removeItem(`@cache:${key}`);
    }

    /**
     * Invalidate all keys containing a pattern
     */
    static async invalidatePattern(pattern: string): Promise<void> {
        const keys = await AsyncStorage.getAllKeys();
        const targets = keys.filter(k => k.includes(pattern));

        for (const k of targets) {
            const rawKey = k.replace('@cache:', '');
            this.memoryCache.delete(rawKey);
            await AsyncStorage.removeItem(k);
        }
    }

    /**
     * Deduplicate fetch calls e aplica STALE-IF-ERROR.
     * Se falhar a rede total, ele tenta resgatar a versão estragada (stale) do cache para não desmanchar a tela.
     */
    static async fetcher<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
        if (this.inflight.has(key)) return this.inflight.get(key);

        const promise = fetchFn().catch(async (e) => {
            console.warn(`[Cache] fetcher failed for ${key}, attempting STALE fallback. Error: ${e.message}`);
            const { data } = await this.getWithStaleInfo<T>(key);
            if (data) {
                console.log(`[Cache] 🛡️ Fallback utilizado para ${key}! Salvando a fluidez da UI apenas como último recurso.`);
                return data;
            }
            throw e; // Sem cache sujo pra salvar, repassa a bomba.
        }).finally(() => this.inflight.delete(key));

        this.inflight.set(key, promise);
        return promise;
    }

    static async clear(): Promise<void> {
        this.memoryCache.clear();
        const keys = await AsyncStorage.getAllKeys();
        const targets = keys.filter(k => k.startsWith('@cache:'));
        await AsyncStorage.multiRemove(targets);
    }
}
