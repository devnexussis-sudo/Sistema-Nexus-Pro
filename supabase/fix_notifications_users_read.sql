-- ==============================================================================
-- FIX ABSOLUTO: Leitura de Notificações pelo Cliente
-- ==============================================================================

-- Remove a policy antiga que limitava apenas a tenant_id
DROP POLICY IF EXISTS "Tenant isolation for notifications" ON public.system_notifications;
DROP POLICY IF EXISTS "notifications_isolation_policy" ON public.system_notifications;
DROP POLICY IF EXISTS "Users can view relevant system notifications" ON public.system_notifications;

-- Cria uma nova policy abrangente para LEITURA (SELECT)
-- Usuários podem ler uma notificação se:
-- 1. For da sua própria tenant (tenant_id)
-- 2. For um "broadcast" (tipo = broadcast)
-- 3. For um "targeted" e a tenant do usuário estiver na lista (target_tenants)
CREATE POLICY "notifications_client_read" ON public.system_notifications
    FOR SELECT TO authenticated
    USING (
        -- É da própria tenant
        tenant_id = public.get_user_tenant_id() OR
        
        -- Ou é um aviso global
        type = 'broadcast' OR
        
        -- Ou é um aviso direcionado (targeted) e a tenant do usuário está no array
        (type = 'targeted' AND public.get_user_tenant_id() = ANY(target_tenants))
    );

-- Recarregar cache
NOTIFY pgrst, 'reload schema';
