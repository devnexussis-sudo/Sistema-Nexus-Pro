
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
     */
    static async get<T>(key: string): Promise<T | null> {
        // 1. Memória
        const entry = this.memoryCache.get(key);
        if (entry) {
            if (Date.now() - entry.timestamp < entry.ttl) {
                return entry.data as T;
            }
            this.memoryCache.delete(key);
        }

        // 2. Disco
        try {
            const diskData = await AsyncStorage.getItem(`@cache:${key}`);
            if (diskData) {
                const diskEntry: CacheEntry = JSON.parse(diskData);
                if (Date.now() - diskEntry.timestamp < diskEntry.ttl) {
                    // Repopular memória
                    this.memoryCache.set(key, diskEntry);
                    return diskEntry.data as T;
                }
                await AsyncStorage.removeItem(`@cache:${key}`);
            }
        } catch (e) {
            console.warn(`[Cache] Fail reading disk for ${key}`);
        }

        return null;
    }

    /**
     * 🛡️ Get stale: retorna dados MESMO que expirados — usado como fallback offline / rede instável
     * Não remove o dado do disco, apenas loga que está servindo dado antigo.
     */
    static async getStale<T>(key: string): Promise<T | null> {
        // 1. Memória (qualquer idade)
        const entry = this.memoryCache.get(key);
        if (entry) return entry.data as T;

        // 2. Disco (qualquer idade)
        try {
            const diskData = await AsyncStorage.getItem(`@cache:${key}`);
            if (diskData) {
                const diskEntry: CacheEntry = JSON.parse(diskData);
                const ageMin = Math.round((Date.now() - diskEntry.timestamp) / 60000);
                console.warn(`[Cache] 📦 Serving STALE data for '${key}' (${ageMin}min old)`);
                this.memoryCache.set(key, diskEntry); // repopula memória
                return diskEntry.data as T;
            }
        } catch (e) {
            console.warn(`[Cache] Fail reading stale disk for ${key}`);
        }

        return null;
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
     * Deduplicate fetch calls
     */
    static async fetcher<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
        if (this.inflight.has(key)) return this.inflight.get(key);

        const promise = fetchFn().finally(() => this.inflight.delete(key));
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
