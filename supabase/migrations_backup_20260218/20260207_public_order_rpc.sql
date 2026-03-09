-- 🛡️ Nexus Pro - Public Order Access RPC
-- Objetivo: Permitir acesso público seguro a ordens de serviço via Token ou ID (se compartilhado)
-- sem expor a chave de serviço no frontend.

-- 1. Função RPC para buscar ordem pública
CREATE OR REPLACE FUNCTION get_public_order(search_term text)
RETURNS SETOF orders AS $$
BEGIN
  -- Lógica de Busca Segura:
  -- 1. Busca exata pelo Public Token (UUID seguro)
  -- 2. OU Busca pelo ID (Legado/Interno) APENAS SE existir um token público associado
  --    (Isso impede varredura de IDs sequenciais que não foram compartilhados explicitamente)
  
  RETURN QUERY
  SELECT * FROM orders
  WHERE public_token = search_term
     OR (id = search_term AND public_token IS NOT NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Permitir acesso público à função (Anon Role)
GRANT EXECUTE ON FUNCTION get_public_order(text) TO anon;
GRANT EXECUTE ON FUNCTION get_public_order(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_public_order(text) TO service_role;

-- 3. Comentário de Auditoria
COMMENT ON FUNCTION get_public_order(text) IS 'Busca segura de OS pública para visualização externa (bypass RLS controlado).';
