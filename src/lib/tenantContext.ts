/**
 * 🏢 Nexus Pro - Tenant Context Manager
 * 
 * Gerenciamento centralizado do contexto de tenant
 * Elimina duplicação de getCurrentTenantId em 13 arquivos
 */

import SessionStorage, { GlobalStorage } from './sessionStorage';

export class TenantContext {
    private static instance: TenantContext;
    private currentTenantId: string | null = null;
    private listeners: Set<(tenantId: string | null) => void> = new Set();

    private constructor() {
        // Singleton pattern
    }

    static getInstance(): TenantContext {
        if (!TenantContext.instance) {
            TenantContext.instance = new TenantContext();
        }
        return TenantContext.instance;
    }

    /**
     * Obtém o tenant ID atual com fallback robusto
     */
    getCurrentTenantId(): string | null {
        // 1. Retornar cache se disponível
        if (this.currentTenantId) {
            return this.currentTenantId;
        }

        try {
            // 2. Verificar sessão de técnico (legacy)
            const techSession = localStorage.getItem('nexus_tech_session_v2') ||
                localStorage.getItem('nexus_tech_session');
            if (techSession) {
                const user = JSON.parse(techSession);
                const tid = user.tenantId || user.tenant_id;
                if (tid) {
                    this.currentTenantId = tid;
                    return tid;
                }
            }

            // 3. Verificar SessionStorage/GlobalStorage
            const userStr = SessionStorage.get('user') || GlobalStorage.get('persistent_user');
            if (userStr) {
                const user = typeof userStr === 'string' ? JSON.parse(userStr) : userStr;
                const tid = user.tenantId || user.tenant_id;
                if (tid) {
                    this.currentTenantId = tid;
                    return tid;
                }
            }

            // 4. Fallback: URL params ou session
            const urlParams = new URLSearchParams(window.location.search);
            const urlTid = urlParams.get('tid') || SessionStorage.get('current_tenant');
            if (urlTid) {
                this.currentTenantId = urlTid;
                return urlTid;
            }

            return null;
        } catch (error) {
            console.error('[TenantContext] Error getting tenant ID:', error);
            return null;
        }
    }

    /**
     * Define o tenant ID atual
     */
    setTenantId(tenantId: string | null): void {
        const oldTenantId = this.currentTenantId;
        this.currentTenantId = tenantId;

        // Notificar listeners se mudou
        if (oldTenantId !== tenantId) {
            this.notifyListeners(tenantId);
        }

        // Persistir no storage
        if (tenantId) {
            SessionStorage.set('current_tenant', tenantId);
        } else {
            SessionStorage.remove('current_tenant');
        }
    }

    /**
     * Limpa o tenant ID atual
     */
    clear(): void {
        this.setTenantId(null);
    }

    /**
     * Adiciona listener para mudanças de tenant
     */
    onChange(callback: (tenantId: string | null) => void): () => void {
        this.listeners.add(callback);

        // Retorna função para remover listener
        return () => {
            this.listeners.delete(callback);
        };
    }

    /**
     * Notifica todos os listeners
     */
    private notifyListeners(tenantId: string | null): void {
        this.listeners.forEach(callback => {
            try {
                callback(tenantId);
            } catch (error) {
                console.error('[TenantContext] Error in listener:', error);
            }
        });
    }

    /**
     * Valida se há um tenant ID válido
     */
    hasValidTenant(): boolean {
        const tenantId = this.getCurrentTenantId();
        return tenantId !== null && tenantId.length > 0;
    }

    /**
     * Obtém tenant ID ou lança erro
     */
    requireTenantId(): string {
        const tenantId = this.getCurrentTenantId();
        if (!tenantId) {
            throw new Error('Tenant ID is required but not available');
        }
        return tenantId;
    }
}

// Export singleton instance
export const tenantContext = TenantContext.getInstance();

// Export helper function for backward compatibility
export function getCurrentTenantId(): string | null {
    return tenantContext.getCurrentTenantId();
}

/**
 * React Hook para usar tenant context
 */
export function useTenantContext() {
    const [tenantId, setTenantId] = React.useState<string | null>(
        tenantContext.getCurrentTenantId()
    );

    React.useEffect(() => {
        // Atualizar quando tenant mudar
        const unsubscribe = tenantContext.onChange(setTenantId);
        return unsubscribe;
    }, []);

    return {
        tenantId,
        setTenantId: (id: string | null) => tenantContext.setTenantId(id),
        hasValidTenant: tenantContext.hasValidTenant(),
        requireTenantId: () => tenantContext.requireTenantId(),
    };
}

// Para uso em componentes que não são React
import * as React from 'react';
