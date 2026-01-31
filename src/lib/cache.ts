/**
 * 🚀 Nexus Smart Cache Layer
 * 
 * Gerenciador de cache inteligente para otimizar requisições e reduzir custo de banda/banco.
 * Implementa estratégia de TTL (Time-To-Live) e escopo por Tenant.
 */

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

export class CacheManager {
    private static storage: Map<string, CacheEntry<any>> = new Map();
    private static inflightRequests: Map<string, Promise<any>> = new Map();

    // Tempos Padrão de Vida (TTL)
    static TTL = {
        SHORT: 30 * 1000,       // 30 segundos (Dashboards)
        MEDIUM: 5 * 60 * 1000,  // 5 minutos (Listas de seleção: Técnicos, Clientes)
        LONG: 60 * 60 * 1000,   // 1 hora (Configurações, Templates)
    };

    /**
     * Tenta recuperar dados do cache. Retorna null se não existir ou tiver expirado.
     */
    static get<T>(key: string): T | null {
        const entry = this.storage.get(key);
        if (!entry) return null;

        if (Date.now() - entry.timestamp > entry.ttl) {
            this.storage.delete(key);
            return null;
        }

        return entry.data as T;
    }

    /**
     * Salva dados no cache com um TTL específico.
     */
    static set(key: string, data: any, ttl: number = this.TTL.MEDIUM): void {
        this.storage.set(key, {
            data,
            timestamp: Date.now(),
            ttl
        });
    }

    /**
     * Remove itens do cache que correspondam a um padrão (ex: 'techs_*').
     * Útil para invalidar cache quando um novo registro é criado.
     */
    static invalidate(pattern: string): void {
        for (const key of this.storage.keys()) {
            if (key.includes(pattern)) {
                this.storage.delete(key);
                console.log(`🧹 Cache Invalidado: ${key}`);
            }
        }
    }

    /**
     * Decorator para deduplicação de requisições.
     * Se uma requisição idêntica já estiver em andamento, retorna a Promise existente.
     */
    static async deduplicate<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
        if (this.inflightRequests.has(key)) {
            // console.log(`🔄 Deduplicando Requisição: ${key}`); // Debug
            return this.inflightRequests.get(key) as Promise<T>;
        }

        const promise = fetcher().finally(() => {
            this.inflightRequests.delete(key);
        });

        this.inflightRequests.set(key, promise);
        return promise;
    }

    static clear(): void {
        this.storage.clear();
        this.inflightRequests.clear();
    }
}
