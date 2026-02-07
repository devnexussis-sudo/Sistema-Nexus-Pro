-- 🛡️ Nexus Pro - Resiliência de Dados via JWT Claims
-- Objetivo: Eliminar recursão infinita e blackout de dados usando metadados do JWT (auth.jwt())

-- 1. Função de Tenant de Alta Performance (Sem consultas ao banco)
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS UUID AS $$
BEGIN
  -- Captura o tenant_id diretamente do JWT Claim gerado pelo Supabase Auth
  -- Isso evita qualquer SELECT na tabela users, eliminando a recursão de RLS.
  RETURN coalesce(
    (auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid,
    (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 2. Trigger de Sincronização de Metadados (Auth <-> Public)
-- Garante que o tenant_id esteja SEMPRE no JWT, mesmo após atualizações no perfil
CREATE OR REPLACE FUNCTION sync_user_tenant_to_auth()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE auth.users
  SET raw_user_metadata = 
    coalesce(raw_user_metadata, '{}'::jsonb) || 
    jsonb_build_object('tenant_id', NEW.tenant_id, 'tenantId', NEW.tenant_id)
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_sync_user_tenant ON public.users;
CREATE TRIGGER tr_sync_user_tenant
AFTER INSERT OR UPDATE OF tenant_id ON public.users
FOR EACH ROW EXECUTE FUNCTION sync_user_tenant_to_auth();

-- 3. Reset e Simplificação das Políticas de RLS
-- Tabela: USERS (Failsafe Total)
DROP POLICY IF EXISTS "Users can view self" ON users;
DROP POLICY IF EXISTS "Users can view others in same tenant" ON users;
DROP POLICY IF EXISTS "Users can view users in same tenant" ON users;

CREATE POLICY "Users can view self" ON users 
FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admin view others in same tenant" ON users 
FOR SELECT USING (
  tenant_id = get_current_tenant_id()
);

-- Tabela: ORDERS
DROP POLICY IF EXISTS "Users can view orders in same tenant" ON orders;
DROP POLICY IF EXISTS "Users can insert orders in same tenant" ON orders;
DROP POLICY IF EXISTS "Users can update orders in same tenant" ON orders;

CREATE POLICY "Users can view orders in same tenant" ON orders 
FOR SELECT USING (tenant_id = get_current_tenant_id());

CREATE POLICY "Users can manage orders in same tenant" ON orders 
FOR ALL USING (tenant_id = get_current_tenant_id());

-- Tabela: CUSTOMERS
DROP POLICY IF EXISTS "Users can view customers in same tenant" ON customers;
CREATE POLICY "Users can view customers in same tenant" ON customers 
FOR SELECT USING (tenant_id = get_current_tenant_id());

CREATE POLICY "Users can manage customers in same tenant" ON customers 
FOR ALL USING (tenant_id = get_current_tenant_id());

-- Tabela: CASH_FLOW
DROP POLICY IF EXISTS "Users can view cash_flow in same tenant" ON cash_flow;
DROP POLICY IF EXISTS "Users can insert cash_flow" ON cash_flow;

CREATE POLICY "Users can view cash_flow in same tenant" ON cash_flow 
FOR SELECT USING (tenant_id = get_current_tenant_id());

CREATE POLICY "Users can insert cash_flow" ON cash_flow 
FOR INSERT WITH CHECK (tenant_id = get_current_tenant_id());

-- 4. Garantir que RLS está habilitado em tudo
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_flow ENABLE ROW LEVEL SECURITY;
ALTER TABLE tech_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

-- 5. Permissões de Acesso (Grants)
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Comentário de Auditoria
COMMENT ON FUNCTION get_current_tenant_id() IS 'Extrai tenant_id do JWT Claims para evitar recursão infinita e acelerar o RLS.';
