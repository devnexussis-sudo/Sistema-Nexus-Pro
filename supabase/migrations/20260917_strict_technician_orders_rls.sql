-- ==============================================================================
-- MIGRATION: RLS ESTRITO PARA ORDENS DE SERVIÇO (FILTRO POR TÉCNICO ATRIBUÍDO)
-- ==============================================================================
-- Regra de Segurança Inquebrável:
-- 1. Administradores/Gestores podem ver TODAS as O.S. do tenant.
-- 2. Técnicos NUNCA podem ver O.S. atribuídas a outros técnicos,
--    mesmo que pertençam à mesma empresa/tenant.
-- ==============================================================================

BEGIN;

-- Helper para verificar se o usuário atual é Administrador ou Gestor
CREATE OR REPLACE FUNCTION public.is_admin_or_manager()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT UPPER(role::text) INTO v_role
  FROM public.users
  WHERE id = auth.uid()
  LIMIT 1;

  IF v_role IN ('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'MASTER', 'ADMINISTRADOR', 'GESTOR') THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- Recriação da Política RLS de SELECT na tabela public.orders
DROP POLICY IF EXISTS "orders_select_tenant" ON public.orders;

CREATE POLICY "orders_select_tenant" ON public.orders FOR SELECT TO authenticated
USING (
  tenant_id = get_auth_tenant_id() 
  AND (
    is_admin_or_manager()
    OR assigned_to = auth.uid()
  )
);

COMMIT;
