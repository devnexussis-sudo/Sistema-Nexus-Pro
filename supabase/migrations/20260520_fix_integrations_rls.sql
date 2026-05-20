-- ============================================================================
-- MIGRATION: REPAIR INTEGRATION RLS POLICIES
-- DESCRIPTION: Corrige as políticas RLS para usar a função padronizada do Nexus.
-- ============================================================================

-- 1. CORREÇÃO DA TABELA API_KEYS
DROP POLICY IF EXISTS "Users can view tenant API keys" ON public.api_keys;
DROP POLICY IF EXISTS "Users can insert API keys" ON public.api_keys;
DROP POLICY IF EXISTS "Users can update API keys" ON public.api_keys;
DROP POLICY IF EXISTS "Users can delete API keys" ON public.api_keys;
DROP POLICY IF EXISTS "api_keys_isolation_policy" ON public.api_keys;

CREATE POLICY "api_keys_isolation_policy" ON public.api_keys FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id())
WITH CHECK (tenant_id = public.get_user_tenant_id());


-- 2. CORREÇÃO DA TABELA WEBHOOKS
DROP POLICY IF EXISTS "Users can view tenant webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Users can insert webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Users can update webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Users can delete webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "webhooks_isolation_policy" ON public.webhooks;

CREATE POLICY "webhooks_isolation_policy" ON public.webhooks FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id())
WITH CHECK (tenant_id = public.get_user_tenant_id());

-- Recarrega o PostgREST para aplicar
NOTIFY pgrst, 'reload schema';
