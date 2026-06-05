-- ============================================================
-- AI KNOWLEDGE BASE - GLOBAL SEARCH V2 (BUSCA TURBINADA)
-- 
-- Agora retorna TODOS os chunks que batem com as keywords,
-- SEM limite artificial no banco, e também faz busca por
-- conteúdo (ILIKE) para não perder nada.
-- ============================================================

-- Remove versão antiga
DROP FUNCTION IF EXISTS public.search_ai_knowledge_global(text[], int);

-- Nova RPC: Busca global turbinada
CREATE OR REPLACE FUNCTION public.search_ai_knowledge_global(
  p_keywords  text[],
  p_limit     int DEFAULT 500
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
    ORDER BY kb.created_at DESC  -- Mais recentes primeiro!
    LIMIT p_limit;
END;
$$;

-- Libera a execução para usuários autenticados e anônimos
GRANT EXECUTE ON FUNCTION public.search_ai_knowledge_global(text[], int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_ai_knowledge_global(text[], int) TO anon;

SELECT 'search_ai_knowledge_global V2 criada com sucesso!' as status;
