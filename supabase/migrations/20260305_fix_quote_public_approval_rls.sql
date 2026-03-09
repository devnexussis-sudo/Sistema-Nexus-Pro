-- 🛡️ Nexus Pro - Fix Public Quote Approval RLS
-- Resolve o erro de RLS ao tentar aprovar ou reprovar orçamentos pelo link público.

BEGIN;

-- Força a propriedade e os privilégios corretos das funções para postgres
-- O postgres possui a flag bypassrls, o que garante que o SECURITY DEFINER
-- executando como owner ignorará a RLS na hora de fazer UPDATE.
ALTER FUNCTION public.approve_quote_public(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, NUMERIC, NUMERIC) OWNER TO postgres;
ALTER FUNCTION public.reject_quote_public(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, NUMERIC, NUMERIC) OWNER TO postgres;

-- Adicionalmente, caso o banco esteja forçando RLS ou outra restrição:
-- Criamos uma regra estrita de UPDATE apenas para quando o status do orçamento
-- estiver sendo alterado para APROVADO ou REJEITADO p/ anon, garantindo as RPCs
-- em Pior Caso sem escalar privilégios.

DROP POLICY IF EXISTS "quotes_anon_public_approval" ON public.quotes;
CREATE POLICY "quotes_anon_public_approval" ON public.quotes
FOR UPDATE
TO anon
USING (
  -- Permite selecionar o orçamento alvo para anon se e somente se for Aberto/Pendente
  status IN ('ABERTO', 'PENDENTE')
)
WITH CHECK (
  -- Garante que após o update, o status seja obrigatoriamente um destes
  status IN ('APROVADO', 'REJEITADO')
);

COMMIT;
