c/**
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
     * Limpa todo o cache
     */
    static clearAll(): void {
        this.storage.clear();
        console.log(`🧹 CacheManager: Todo o cache foi limpo.`);
    }

    /**
     * Invalida todas as chaves que contêm o padrão fornecido.
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
     * Recebe um signal opcional que permite o cancelamento repassado.
     */
    static deduplicate<T>(key: string, fetcher: (signal?: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
        if (this.inflightRequests.has(key)) {
            // Se já existe uma requisição em voo, retorna ela (Deduplicação)
            // Se o signal abortar, a requisição atual que está em voo continuará se não repassamos o cancel.
            // Para simplicidade, apenas retornamos a promise.
            return this.inflightRequests.get(key) as Promise<T>;
        }

        // Setup Timeout Safety de 10s
        const promise = new Promise<T>((resolve, reject) => {
            const safetyTimeout = setTimeout(() => {
                console.warn(`⚠️ [CacheManager] Safety Timeout (10s) - Limpando requisição travada: ${key}`);
                this.inflightRequests.delete(key);
                reject(new Error(`Timeout de requisição CacheManager (${key})`));
            }, 10000);

            // Executa o fetch real passando o signal
            fetcher(signal)
                .then(data => {
                    clearTimeout(safetyTimeout);
                    resolve(data);
                })
                .catch(err => {
                    clearTimeout(safetyTimeout);
                    // Clear automático se for Network error ou Abort, para não cachear erros de infraestrutura
                    const isAbort = err.name === 'AbortError' || err.message?.includes('Abort');
                    const isNetwork = err.message?.includes('Network') || err.message?.includes('fetch');

                    if (isAbort || isNetwork) {
                        console.warn(`🧹 [CacheManager] Limpando inflight cache por erro transitório (${isAbort ? 'Abort' : 'Network'}): ${key}`);
                        this.inflightRequests.delete(key);
                        this.storage.delete(key);
                    }

                    reject(err);
                })
                .finally(() => {
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
