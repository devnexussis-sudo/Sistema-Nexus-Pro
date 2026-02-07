-- ========================================
-- NEXUS PRO - CORREÇÃO DE LINKS PÚBLICOS
-- ========================================
-- INSTRUÇÕES:
-- 1. Acesse: https://supabase.com/dashboard
-- 2. Selecione seu projeto
-- 3. Vá em: SQL Editor > New Query
-- 4. Cole TODO este SQL abaixo
-- 5. Clique em RUN
-- ========================================

-- 🛡️ Função 1: Buscar Ordem de Serviço Pública
CREATE OR REPLACE FUNCTION get_public_order(search_term text)
RETURNS SETOF orders AS $$
BEGIN
  -- Lógica de Busca Segura:
  -- 1. Busca exata pelo Public Token (UUID seguro)
  -- 2. OU Busca pelo ID (Legado/Interno) APENAS SE existir um token público associado
  
  RETURN QUERY
  SELECT * FROM orders
  WHERE public_token = search_term
     OR (id = search_term AND public_token IS NOT NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permitir acesso público à função
GRANT EXECUTE ON FUNCTION get_public_order(text) TO anon;
GRANT EXECUTE ON FUNCTION get_public_order(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_public_order(text) TO service_role;

COMMENT ON FUNCTION get_public_order(text) IS 'Busca segura de OS pública para visualização externa (bypass RLS controlado).';

-- ========================================

-- 🛡️ Função 2: Buscar Técnicos Públicos (Nome/Avatar)
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

-- Permitir acesso público à função
GRANT EXECUTE ON FUNCTION get_public_technicians(uuid) TO anon;
GRANT EXECUTE ON FUNCTION get_public_technicians(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_public_technicians(uuid) TO service_role;

-- ========================================
-- FIM - Agora teste o link público novamente!
-- ========================================
