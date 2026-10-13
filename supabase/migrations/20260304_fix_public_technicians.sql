-- ============================================================
-- Fix: get_public_technicians
-- Objetivo: Garantir que a tela pública possa carregar técnicos
-- de um tenant específico sem depender de ACL/RLS de usuário logado.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_public_technicians(p_tenant_id UUID)
RETURNS TABLE (
  id uuid,
  name text,
  avatar text,
  tenant_id uuid
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id, 
    t.name, 
    t.avatar, 
    t.tenant_id
  FROM public.technicians t
  WHERE t.tenant_id = p_tenant_id 
    AND t.active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_public_technicians(UUID) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
