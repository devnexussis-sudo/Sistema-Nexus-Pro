-- ============================================================================
-- Migration: fix defect_types RLS policies to use get_auth_tenant_id()
-- Corrigir políticas RLS da tabela defect_types para usar a função SECURITY DEFINER
-- get_auth_tenant_id(), evitando recursão na tabela users e falhas de escrita.
-- ============================================================================

BEGIN;

-- Garante que a função get_auth_tenant_id() exista (SECURITY DEFINER, sem recursão)
CREATE OR REPLACE FUNCTION public.get_auth_tenant_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'tenantId', '')::uuid,
    NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'tenant_id', '')::uuid,
    (SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1)
  );
$$;

-- Recriar políticas de defect_types usando get_auth_tenant_id()
DROP POLICY IF EXISTS "defect_types_select" ON public.defect_types;
DROP POLICY IF EXISTS "defect_types_insert" ON public.defect_types;
DROP POLICY IF EXISTS "defect_types_update" ON public.defect_types;
DROP POLICY IF EXISTS "defect_types_delete" ON public.defect_types;

CREATE POLICY "defect_types_select" ON public.defect_types
    FOR SELECT TO authenticated
    USING (tenant_id = public.get_auth_tenant_id());

CREATE POLICY "defect_types_insert" ON public.defect_types
    FOR INSERT TO authenticated
    WITH CHECK (tenant_id = public.get_auth_tenant_id());

CREATE POLICY "defect_types_update" ON public.defect_types
    FOR UPDATE TO authenticated
    USING (tenant_id = public.get_auth_tenant_id())
    WITH CHECK (tenant_id = public.get_auth_tenant_id());

CREATE POLICY "defect_types_delete" ON public.defect_types
    FOR DELETE TO authenticated
    USING (tenant_id = public.get_auth_tenant_id());

COMMIT;
