import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TenantContext, getCurrentTenantId } from '@/lib/tenantContext';
import SessionStorage, { GlobalStorage } from '@/lib/sessionStorage';

describe('TenantContext', () => {
    let tenantContext: TenantContext;

    beforeEach(() => {
        tenantContext = TenantContext.getInstance();
        tenantContext.clear();
        SessionStorage.clear();
        GlobalStorage.clear();
        localStorage.clear();
    });

    afterEach(() => {
        tenantContext.clear();
    });

    describe('Singleton Pattern', () => {
        it('deve retornar sempre a mesma instância', () => {
            const instance1 = TenantContext.getInstance();
            const instance2 = TenantContext.getInstance();

            expect(instance1).toBe(instance2);
        });
    });

    describe('getCurrentTenantId', () => {
        it('deve retornar null quando não há tenant', () => {
            const tenantId = tenantContext.getCurrentTenantId();
            expect(tenantId).toBeNull();
        });

        it('deve retornar tenant ID do cache', () => {
            tenantContext.setTenantId('test-tenant-123');
            const tenantId = tenantContext.getCurrentTenantId();
            expect(tenantId).toBe('test-tenant-123');
        });

        it('deve recuperar tenant ID do SessionStorage', () => {
            const user = { tenantId: 'session-tenant-456' };
            SessionStorage.set('user', JSON.stringify(user));

            const tenantId = tenantContext.getCurrentTenantId();
            expect(tenantId).toBe('session-tenant-456');
        });

        it('deve recuperar tenant ID do GlobalStorage', () => {
            const user = { tenant_id: 'global-tenant-789' };
            GlobalStorage.set('persistent_user', JSON.stringify(user));

            const tenantId = tenantContext.getCurrentTenantId();
            expect(tenantId).toBe('global-tenant-789');
        });

        it('deve priorizar SessionStorage sobre GlobalStorage', () => {
            const sessionUser = { tenantId: 'session-tenant' };
            const globalUser = { tenantId: 'global-tenant' };

            SessionStorage.set('user', JSON.stringify(sessionUser));
            GlobalStorage.set('persistent_user', JSON.stringify(globalUser));

            const tenantId = tenantContext.getCurrentTenantId();
            expect(tenantId).toBe('session-tenant');
        });
    });

    describe('setTenantId', () => {
        it('deve definir tenant ID', () => {
            tenantContext.setTenantId('new-tenant-123');
            expect(tenantContext.getCurrentTenantId()).toBe('new-tenant-123');
        });

        it('deve persistir no SessionStorage', () => {
            tenantContext.setTenantId('persistent-tenant');
            const stored = SessionStorage.get('current_tenant');
            expect(stored).toBe('persistent-tenant');
        });

        it('deve limpar SessionStorage quando null', () => {
            tenantContext.setTenantId('temp-tenant');
            tenantContext.setTenantId(null);

            const stored = SessionStorage.get('current_tenant');
            expect(stored).toBeNull();
        });
    });

    describe('clear', () => {
        it('deve limpar tenant ID', () => {
            tenantContext.setTenantId('tenant-to-clear');
            tenantContext.clear();

            expect(tenantContext.getCurrentTenantId()).toBeNull();
        });
    });

    describe('onChange', () => {
        it('deve notificar listeners quando tenant muda', () => {
            const listener = vi.fn();
            tenantContext.onChange(listener);

            tenantContext.setTenantId('new-tenant');

            expect(listener).toHaveBeenCalledWith('new-tenant');
        });

        it('não deve notificar quando tenant não muda', () => {
            const listener = vi.fn();
            tenantContext.setTenantId('same-tenant');
            tenantContext.onChange(listener);

            tenantContext.setTenantId('same-tenant');

            expect(listener).not.toHaveBeenCalled();
        });

        it('deve permitir remover listener', () => {
            const listener = vi.fn();
            const unsubscribe = tenantContext.onChange(listener);

            unsubscribe();
            tenantContext.setTenantId('new-tenant');

            expect(listener).not.toHaveBeenCalled();
        });
    });

    describe('hasValidTenant', () => {
        it('deve retornar false quando não há tenant', () => {
            expect(tenantContext.hasValidTenant()).toBe(false);
        });

        it('deve retornar true quando há tenant válido', () => {
            tenantContext.setTenantId('valid-tenant');
            expect(tenantContext.hasValidTenant()).toBe(true);
        });

        it('deve retornar false para string vazia', () => {
            tenantContext.setTenantId('');
            expect(tenantContext.hasValidTenant()).toBe(false);
        });
    });

    describe('requireTenantId', () => {
        it('deve retornar tenant ID quando disponível', () => {
            tenantContext.setTenantId('required-tenant');
            expect(tenantContext.requireTenantId()).toBe('required-tenant');
        });

        it('deve lançar erro quando não há tenant', () => {
            expect(() => tenantContext.requireTenantId()).toThrow('Tenant ID is required');
        });
    });

    describe('Helper function', () => {
        it('getCurrentTenantId deve usar singleton', () => {
            tenantContext.setTenantId('helper-tenant');
            expect(getCurrentTenantId()).toBe('helper-tenant');
        });
    });
});
