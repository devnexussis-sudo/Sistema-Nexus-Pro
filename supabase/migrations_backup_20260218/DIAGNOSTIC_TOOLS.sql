-- ==============================================================================
-- FERRAMENTAS DE DIAGNÓSTICO DO BANCO DE DADOS (NEXUS PRO)
-- Execute cada bloco separadamente no SQL Editor do Supabase
-- ==============================================================================

-- BLOCO 1: VERIFICAR POLÍTICAS DE SEGURANÇA (RLS)
-- Lista todas as políticas ativas nas tabelas principais.
-- Procure por políticas duplicadas ou lógicas conflitantes.
SELECT 
  tablename as tabela, 
  policyname as nome_politica, 
  cmd as comando, 
  roles as perfis_afetados 
FROM pg_policies 
WHERE schemaname = 'public' 
ORDER BY tablename, cmd;

-- ==============================================================================

-- BLOCO 2: VERIFICAR ESTRUTURA DAS TABELAS (COLUNAS)
-- Confere se as colunas essenciais (como cnpj na tabela tenants) existem.
SELECT 
  table_name as tabela, 
  column_name as coluna, 
  data_type as tipo,
  is_nullable as aceita_nulo
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name IN ('tenants', 'users', 'orders')
ORDER BY table_name, ordinal_position;

-- ==============================================================================

-- BLOCO 3: VERIFICAR FUNÇÕES DE SEGURANÇA
-- Analisa se as funções críticas estão definidas como SECURITY DEFINER (prosecdef = true)
-- Se 'security_definer' for false, elas podem causar loop infinito/travamento.
SELECT 
  proname as nome_funcao, 
  CASE WHEN prosecdef THEN 'SIM (Seguro)' ELSE 'NÃO (Risco de Loop)' END as security_definer,
  provolatile as volatilidade -- Deve ser 's' (Stable) ou 'i' (Immutable)
FROM pg_proc 
JOIN pg_namespace n ON pronamespace = n.oid 
WHERE n.nspname = 'public' 
  AND proname IN ('get_user_tenant_id', 'is_admin', 'get_user_organization_id');
