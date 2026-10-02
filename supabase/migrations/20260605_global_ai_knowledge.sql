-- ============================================================
-- AI KNOWLEDGE BASE - GLOBAL SEARCH
-- O usuário solicitou que manuais e PDFs ensinados à IA sejam
-- compartilhados com TODOS os tenants/empresas.
-- ============================================================

-- Remove a RPC restrita por tenant (se existir)
DROP FUNCTION IF EXISTS public.search_ai_knowledge(uuid, text[], int);

-- Cria uma nova RPC global que busca em TODOS os registros,
-- contornando o RLS (via SECURITY DEFINER) e usando busca flexível.
CREATE OR REPLACE FUNCTION public.search_ai_knowledge_global(
  p_keywords  text[],
  p_limit     int DEFAULT 50
)
RETURNS TABLE (content text, source_name text, keywords text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT
      kb.content,
      kb.source_name,
      kb.keywords
    FROM public.ai_knowledge_base kb
    WHERE kb.keywords && p_keywords
       OR EXISTS (
         SELECT 1 
         FROM unnest(p_keywords) kw 
         WHERE kb.content ILIKE '%' || kw || '%'
       )
    LIMIT p_limit;
END;
$$;

-- Libera a execução para usuários autenticados
GRANT EXECUTE ON FUNCTION public.search_ai_knowledge_global(text[], int) TO authenticated;

-- (Opcional) Confirmação de que foi criada
SELECT 'search_ai_knowledge_global criada com sucesso!' as status;
