-- Tabela de Base de Conhecimento para Duno IA
CREATE TABLE public.ai_knowledge_base (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  source_name TEXT NOT NULL,
  source_type TEXT DEFAULT 'pdf',
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  keywords TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.ai_knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON public.ai_knowledge_base
  USING (tenant_id = public.get_user_tenant_id());

-- Indexes for fast searches
CREATE INDEX idx_ai_kb_keywords ON public.ai_knowledge_base USING GIN (keywords);
CREATE INDEX idx_ai_kb_tenant ON public.ai_knowledge_base (tenant_id);
