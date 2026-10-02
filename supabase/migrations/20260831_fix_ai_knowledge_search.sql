-- ============================================================
-- AI KNOWLEDGE BASE - BUSCA V3 COM SECURITY DEFINER
-- Bypass de RLS para garantir que a IA funcione
-- ============================================================

CREATE OR REPLACE FUNCTION public.search_ai_knowledge_v3(
  p_tenant_id uuid,
  p_keywords  text[],
  p_limit     int DEFAULT 20
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
      (
        SELECT COUNT(*)::int
        FROM unnest(p_keywords) kw
        WHERE kb.content ILIKE '%' || kw || '%'
           OR kw = ANY(kb.keywords)
      ) AS relevance_score
    FROM public.ai_knowledge_base kb
    WHERE
      kb.tenant_id = p_tenant_id
      AND (
        kb.keywords && p_keywords
        OR EXISTS (
          SELECT 1
          FROM unnest(p_keywords) kw
          WHERE kb.content ILIKE '%' || kw || '%'
        )
      )
    ORDER BY relevance_score DESC, kb.chunk_index ASC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_ai_knowledge_v3(uuid, text[], int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_ai_knowledge_v3(uuid, text[], int) TO anon;
