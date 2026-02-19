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
    /**
     * Remove itens do cache que correspondam a um padrão (ex: 'techs_').
     * Útil quando um registro é criado/atualizado.
     */
    static invalidate(pattern: string): void {
        const keysToDelete: string[] = [];
        for (const key of this.storage.keys()) {
            if (key.includes(pattern)) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(k => {
            this.storage.delete(k);
            console.log(`🧹 CacheManager: Invalidado ${k}`); // Better logging
        });
    }

    /**
     * Decorator para deduplicação de requisições.
     * Se uma requisição idêntica já estiver em andamento, retorna a Promise existente.
     */
    static deduplicate<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
        if (this.inflightRequests.has(key)) {
            // Se já existe uma requisição em voo, retorna ela (Deduplicação)
            return this.inflightRequests.get(key) as Promise<T>;
        }

        // Cria uma promise wrapper que controla tanto o fetch quanto o timeout
        const promise = new Promise<T>((resolve, reject) => {
            // Setup Timeout Safety (20s)
            const safetyTimeout = setTimeout(() => {
                console.warn(`⚠️ [CacheManager] Safety Timeout (20s) - Limpando requisição travada: ${key}`);
                this.inflightRequests.delete(key);
                reject(new Error(`Timeout de requisição (${key})`));
            }, 20000);

            // Executa o fetch real
            fetcher()
                .then(data => {
                    clearTimeout(safetyTimeout);
                    resolve(data);
                })
                .catch(err => {
                    clearTimeout(safetyTimeout);
                    reject(err);
                })
                .finally(() => {
                    // Sempre limpa o mapa de voo ao terminar (sucesso ou erro)
                    // Mas apenas se ainda estiver lá (o timeout pode ter limpado antes)
                    if (this.inflightRequests.get(key) === promise) {
                        this.inflightRequests.delete(key);
                    }
                });
        });

        this.inflightRequests.set(key, promise);

        return promise;
    }

    static clear(): void {
        this.storage.clear();
        this.inflightRequests.clear();
    }
}
