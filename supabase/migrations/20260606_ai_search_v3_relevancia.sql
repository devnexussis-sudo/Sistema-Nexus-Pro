-- ============================================================
-- AI KNOWLEDGE BASE - BUSCA V3 (RELEVÂNCIA CIRÚRGICA)
-- 
-- Ordena por RELEVÂNCIA real (quantas keywords batem)
-- em vez de data de criação.
-- Com micro-chunks de 1500 chars, isso é muito mais preciso.
-- ============================================================

-- Remove versão antiga
DROP FUNCTION IF EXISTS public.search_ai_knowledge_global(text[], int);

-- Nova RPC: Busca por relevância real
CREATE OR REPLACE FUNCTION public.search_ai_knowledge_global(
  p_keywords  text[],
  p_limit     int DEFAULT 10
)
RETURNS TABLE (content text, source_name text, keywords text[], relevance_score int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT
      kb.content,
      kb.source_name,
      kb.keywords,
      -- Conta quantas keywords da pergunta aparecem neste chunk (relevância real)
      (
        SELECT COUNT(*)::int
        FROM unnest(p_keywords) kw
        WHERE kb.content ILIKE '%' || kw || '%'
           OR kw = ANY(kb.keywords)
      ) AS relevance_score
    FROM public.ai_knowledge_base kb
    WHERE
      -- Só traz chunks que realmente têm alguma das keywords
      kb.keywords && p_keywords
      OR EXISTS (
        SELECT 1
        FROM unnest(p_keywords) kw
        WHERE kb.content ILIKE '%' || kw || '%'
      )
    ORDER BY relevance_score DESC, kb.chunk_index ASC
    LIMIT p_limit;
END;
$$;

-- Libera execução para todos
GRANT EXECUTE ON FUNCTION public.search_ai_knowledge_global(text[], int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_ai_knowledge_global(text[], int) TO anon;

-- Adiciona índice de texto completo para busca ultra-rápida
CREATE INDEX IF NOT EXISTS idx_ai_kb_content_gin 
  ON public.ai_knowledge_base USING GIN (to_tsvector('portuguese', content));

SELECT 'search_ai_knowledge_global V3 (Relevância Cirúrgica) criada com sucesso!' as status;
