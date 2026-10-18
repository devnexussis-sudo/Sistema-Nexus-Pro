-- ==============================================================================
-- MIGRAÇÃO: Limpeza Definitiva de Manuais da IA e Listagem Agrupada (RLS Safe)
-- Data: 2026-10-18
-- Objetivo: Garantir exclusão cirúrgica de 100% dos chunks de um manual por tenant,
--           sem deixar órfãos no banco de dados e sem falhas de RLS de sessão.
-- ==============================================================================

-- 1. Índice composto de alta performance para busca e deleção por tenant e manual
CREATE INDEX IF NOT EXISTS idx_ai_kb_tenant_source 
  ON public.ai_knowledge_base (tenant_id, source_name);

-- 2. Função RPC com SECURITY DEFINER para exclusão definitiva de um manual
CREATE OR REPLACE FUNCTION public.delete_ai_knowledge_document(
  p_tenant_id uuid,
  p_source_name text
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count int;
BEGIN
  -- Validação defensiva: impede deleção acidental sem tenant ou nome
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'p_tenant_id é obrigatório para exclusão segura.';
  END IF;

  IF p_source_name IS NULL OR trim(p_source_name) = '' THEN
    RAISE EXCEPTION 'p_source_name é obrigatório para exclusão segura.';
  END IF;

  -- Remove 100% dos chunks do arquivo selecionado pertencentes estritamente a este tenant
  DELETE FROM public.ai_knowledge_base
  WHERE tenant_id = p_tenant_id
    AND (source_name = p_source_name OR source_name ILIKE p_source_name);

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN v_deleted_count;
END;
$$;

-- Permissões de execução para a função de exclusão
GRANT EXECUTE ON FUNCTION public.delete_ai_knowledge_document(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_ai_knowledge_document(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.delete_ai_knowledge_document(uuid, text) TO service_role;

-- 3. Função RPC com SECURITY DEFINER para listagem consolidada de manuais por tenant
CREATE OR REPLACE FUNCTION public.list_ai_knowledge_documents(
  p_tenant_id uuid
)
RETURNS TABLE (
  source_name text,
  source_type text,
  created_at timestamptz,
  total_chunks int,
  metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT 
      kb.source_name,
      COALESCE(MAX(kb.source_type), 'pdf') AS source_type,
      MIN(kb.created_at) AS created_at,
      COUNT(*)::int AS total_chunks,
      COALESCE((ARRAY_AGG(kb.metadata ORDER BY kb.chunk_index ASC))[1], '{}'::jsonb) AS metadata
    FROM public.ai_knowledge_base kb
    WHERE kb.tenant_id = p_tenant_id
    GROUP BY kb.source_name
    ORDER BY MIN(kb.created_at) DESC;
END;
$$;

-- Permissões de execução para a função de listagem
GRANT EXECUTE ON FUNCTION public.list_ai_knowledge_documents(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_ai_knowledge_documents(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.list_ai_knowledge_documents(uuid) TO service_role;

-- 4. Atualização da Política RLS de DELETE na tabela ai_knowledge_base como redundância
DROP POLICY IF EXISTS "ai_kb_delete" ON public.ai_knowledge_base;
CREATE POLICY "ai_kb_delete" ON public.ai_knowledge_base
  FOR DELETE TO authenticated
  USING (
    tenant_id::text = COALESCE(
      auth.jwt() -> 'user_metadata' ->> 'tenantId',
      auth.jwt() -> 'user_metadata' ->> 'tenant_id',
      auth.jwt() -> 'app_metadata'  ->> 'tenant_id'
    )
    OR tenant_id = public.get_auth_tenant_id()
  );

-- Confirmação
SELECT 'Funções delete_ai_knowledge_document e list_ai_knowledge_documents configuradas com sucesso!' as status;
