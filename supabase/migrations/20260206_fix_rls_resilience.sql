-- Resiliência de Dados Nexus Pro - Correção de RLS e Conectividade
-- Objetivo: Remover potenciais recursões e garantir que usuários autenticados sempre acessem seus próprios dados.

-- 1. Recriar função de Tenant de forma determinística e com cache de sessão se possível
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS UUID AS $$
DECLARE
  _tid UUID;
BEGIN
  -- Tentar pegar do cache da sessão primeiro (acessa rápido)
  -- Em Supabase, podemos usar variáveis de configuração customizadas se setadas pelo PostgREST,
  -- mas o padrão robusto é buscar na tabela de usuários.
  -- Usamos 'public' explicitamente para evitar busca em search_path.
  SELECT tenant_id INTO _tid FROM public.users WHERE id = auth.uid();
  RETURN _tid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Revogar e Recriar Políticas de Usuários (Evitando Recursão)
-- Permitir que o usuário veja a si mesmo SEMPRE, independente do tenant_id (para evitar blackout no login)
DROP POLICY IF EXISTS "Users can view users in same tenant" ON users;
CREATE POLICY "Users can view self" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can view others in same tenant" ON users FOR SELECT USING (tenant_id = get_current_tenant_id());

-- 3. Garantir Políticas para Ordens, Clientes e Ativos com Failsafe
DROP POLICY IF EXISTS "Users can view orders in same tenant" ON orders;
CREATE POLICY "Users can view orders in same tenant" ON orders 
FOR SELECT USING (
  tenant_id = get_current_tenant_id() 
  OR 
  (auth.uid() IS NOT NULL AND tenant_id IS NULL) -- Failsafe para itens globais/seed
);

DROP POLICY IF EXISTS "Users can view customers in same tenant" ON customers;
CREATE POLICY "Users can view customers in same tenant" ON customers 
FOR SELECT USING (tenant_id = get_current_tenant_id());

-- 4. Políticas para a nova Tabela de Fluxo de Caixa (RLS AUDIT)
DROP POLICY IF EXISTS "Users can view cash_flow in same tenant" ON cash_flow;
CREATE POLICY "Users can view cash_flow in same tenant" ON cash_flow 
FOR SELECT USING (tenant_id = get_current_tenant_id());

CREATE POLICY "Users can insert cash_flow" ON cash_flow 
FOR INSERT WITH CHECK (tenant_id = get_current_tenant_id());

-- 5. Políticas para Estoque Técnico
DROP POLICY IF EXISTS "Users can view tech_stock" ON tech_stock;
CREATE POLICY "Users can view tech_stock" ON tech_stock 
FOR SELECT USING (tenant_id = get_current_tenant_id());

CREATE POLICY "Users can update tech_stock" ON tech_stock 
FOR ALL USING (tenant_id = get_current_tenant_id());

-- 6. Grant Permissions (Garantir que o papel 'authenticated' tenha acesso às tabelas)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Log de Auditoria de Migração
COMMENT ON FUNCTION get_current_tenant_id() IS 'Retorna o ID do Tenant do usuário logado via SECURITY DEFINER para evitar recursão de RLS.';
