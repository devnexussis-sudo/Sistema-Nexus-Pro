-- ============================================================
-- GLOBAL KNOWLEDGE RLS
-- Permite que TODOS os inquilinos (tenants) LEIAM os manuais (PDFs)
-- uns dos outros, transformando o Duno IA numa base global.
-- Mas a ESCRITA / EDIÇÃO continua isolada por tenant.
-- ============================================================

-- Remove as políticas atuais de SELECT
DROP POLICY IF EXISTS "ai_kb_select" ON public.ai_knowledge_base;

-- Cria a nova política que libera a LEITURA GLOBAL para qualquer usuário logado
CREATE POLICY "ai_kb_select" ON public.ai_knowledge_base
  FOR SELECT TO authenticated
  USING (true);

SELECT 'Leitura global de PDFs ativada com sucesso!' as status;
