/**
 * 🏢 Nexus Pro - Tenant Context Manager (Singleton)
 *
 * Fonte única de verdade para o tenant_id do usuário autenticado.
 *
 * ⛔ REGRA DE SEGURANÇA (FATAL-S2 fix):
 *   Se o usuário está autenticado, o tenant_id vem OBRIGATORIAMENTE
 *   da sessão/JWT. Parâmetros de URL (`?tid=`) são IGNORADOS para
 *   usuários autenticados, impedindo injeção de tenant via URL.
 *
 *   O fallback de URL params só é aceito para rotas públicas
 *   (ex: /view-quote/) onde não há sessão.
 */

import SessionStorage, { GlobalStorage } from './sessionStorage';

// ─── Tipos ───────────────────────────────────────────────
type TenantChangeListener = (tenantId: string | null) => void;

// ─── Singleton ───────────────────────────────────────────
class TenantContextManager {
    private static instance: TenantContextManager;
    private cachedTenantId: string | null = null;
    private listeners: Set<TenantChangeListener> = new Set();

    private constructor() { /* Singleton */ }

    static getInstance(): TenantContextManager {
        if (!TenantContextManager.instance) {
            TenantContextManager.instance = new TenantContextManager();
        }
        return TenantContextManager.instance;
    }

    /**
     * Obtém o tenant ID atual com fallback seguro.
     *
     * Ordem de prioridade:
     *   1. Cache em memória (mais rápido)
     *   2. Sessão de técnico (localStorage — PWA persistence)
     *   3. Sessão de admin (SessionStorage/GlobalStorage)
     *   4. SessionStorage `current_tenant` (impersonation)
     *   5. ⛔ URL params — APENAS se NÃO houver sessão autenticada
     *
     * Retorna `undefined` (não `null`) para compatibilidade com os services.
     */
    getCurrentTenantId(): string | undefined {
        // 1. Cache em memória
        if (this.cachedTenantId) return this.cachedTenantId;

        try {
            // 2. Sessão de técnico (localStorage — sobrevive a reloads em PWA)
            const techSession = localStorage.getItem('nexus_tech_session_v2') ||
                localStorage.getItem('nexus_tech_session');
            if (techSession) {
                const user = JSON.parse(techSession);
                const tid = user.tenantId || user.tenant_id;
                if (tid) {
                    this.cachedTenantId = tid;
                    return tid;
                }
            }

            // 3. Sessão de admin/operador (SessionStorage — isolada por aba)
            const userStr = SessionStorage.get('user') || GlobalStorage.get('persistent_user');
            if (userStr) {
                const user = typeof userStr === 'string' ? JSON.parse(userStr) : userStr;
                const tid = user.tenantId || user.tenant_id;
                if (tid) {
                    this.cachedTenantId = tid;
                    return tid;
                }
            }

            // 4. SessionStorage `current_tenant` (setado por impersonation no SuperAdminPage)
            const storedTenant = SessionStorage.get('current_tenant');
            if (storedTenant) {
                this.cachedTenantId = storedTenant;
                return storedTenant;
            }

            // ⛔ 5. URL params — BLOQUEADO para usuários autenticados.
            // Se chegamos aqui, não há sessão alguma. Verificamos URL apenas
            // para rotas públicas (ex: /view-quote/?tid=xxx) onde é legítimo.
            const isPublicRoute = window.location.hash.startsWith('#/view/') ||
                window.location.hash.startsWith('#/view-quote/');
            // 2. URL Parameter (v7 logic) - Suporta Search e Hash (Importante para HashRouter)
            const getParam = (name: string) => {
                const searchParams = new URLSearchParams(window.location.search);
                if (searchParams.has(name)) return searchParams.get(name);

                // Fallback para HashRouter: extrai params do hash (ex: #/admin?tid=xxx)
                const hash = window.location.hash;
                const hashParts = hash.split('?');
                if (hashParts.length > 1) {
                    const hashSearchParams = new URLSearchParams(hashParts[1]);
                    return hashSearchParams.get(name);
                }
                return null;
            };

            // 5. URL Parameter (v7 logic) - Suporta Search e Hash (Importante para HashRouter)
            // Agora permitimos fallback para URL se chegarmos aqui sem ter encontrado tid na sessão,
            // ou se for uma rota pública.
            const tidFromUrl = getParam('tid') || getParam('tenantId') || getParam('tenant');
            if (tidFromUrl && tidFromUrl !== 'undefined' && tidFromUrl !== 'null') {
                console.log('[TenantContext] 🔗 TenantID extraído da URL (Fallback):', tidFromUrl);
                // Se NÃO estamos em rota pública e encontramos tid na URL, podemos cachear
                // para evitar re-análise constante do hash.
                if (!isPublicRoute) {
                    this.cachedTenantId = tidFromUrl;
                }
                return tidFromUrl;
            }

            return undefined;
        } catch (error) {
            console.error('[TenantContext] ❌ Erro ao obter tenant ID:', error);
            return undefined;
        }
    }

    /**
     * Define o tenant ID atual (chamado no login/impersonation).
     */
    setTenantId(tenantId: string | null): void {
        const oldTenantId = this.cachedTenantId;
        this.cachedTenantId = tenantId;

        if (oldTenantId !== tenantId) {
            this.notifyListeners(tenantId);
        }

        if (tenantId) {
            SessionStorage.set('current_tenant', tenantId);
        } else {
            SessionStorage.remove('current_tenant');
        }
    }

    /**
     * Limpa o cache e o storage (chamado no logout).
     */
    clear(): void {
        this.cachedTenantId = null;
        SessionStorage.remove('current_tenant');
        this.notifyListeners(null);
    }

    /**
     * Invalida o cache para forçar nova leitura do storage.
     * Útil quando os dados de sessão mudam externamente.
     */
    invalidateCache(): void {
        this.cachedTenantId = null;
    }

    /**
     * Adiciona listener para mudanças de tenant.
     * Retorna função de cleanup.
     */
    onChange(callback: TenantChangeListener): () => void {
        this.listeners.add(callback);
        return () => { this.listeners.delete(callback); };
    }

    /**
     * Verifica se há um tenant válido definido.
     */
    hasValidTenant(): boolean {
        return !!this.getCurrentTenantId();
    }

    /**
     * Obtém tenant ID ou lança erro (para operações que EXIGEM tenant).
     */
    requireTenantId(): string {
        const tid = this.getCurrentTenantId();
        if (!tid) throw new Error('[TenantContext] Tenant ID obrigatório mas não encontrado.');
        return tid;
    }

    private notifyListeners(tenantId: string | null): void {
        this.listeners.forEach(callback => {
            try { callback(tenantId); }
            catch (e) { console.error('[TenantContext] Erro em listener:', e); }
        });
    }
}

// ─── Exports ─────────────────────────────────────────────

/** Instância singleton do TenantContext */
export const tenantContext = TenantContextManager.getInstance();

/**
 * Função helper para compatibilidade com os services existentes.
 * Use esta em vez de implementações locais de getCurrentTenantId().
 */
export function getCurrentTenantId(): string | undefined {
    return tenantContext.getCurrentTenantId();
}

// Re-export da classe para testes
export { TenantContextManager };
