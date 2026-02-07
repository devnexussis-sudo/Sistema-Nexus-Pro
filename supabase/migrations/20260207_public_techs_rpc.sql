-- 🛡️ Nexus Pro - Public Technicians Access RPC
-- Objetivo: Permitir que a visualização pública da OS mostre o nome/avatar do técnico responsável
-- sem expor dados sensíveis como telefone/email ou permitir listagem irrestrita.

CREATE OR REPLACE FUNCTION get_public_technicians(p_tenant_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  avatar text,
  tenant_id uuid
) AS $$
BEGIN
  RETURN QUERY
  SELECT t.id, t.name, t.avatar, t.tenant_id
  FROM technicians t
  WHERE t.tenant_id = p_tenant_id
    AND t.active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permissões
GRANT EXECUTE ON FUNCTION get_public_technicians(uuid) TO anon;
GRANT EXECUTE ON FUNCTION get_public_technicians(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_public_technicians(uuid) TO service_role;
