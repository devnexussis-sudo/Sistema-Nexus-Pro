-- ============================================
-- 🔧 NEXUS PRO - SUPABASE DATABASE SETUP
-- VERSÃO CORRIGIDA - SEM DELETED_AT
-- ============================================
-- Execute este script no Supabase SQL Editor
-- Dashboard > SQL Editor > New Query

-- ============================================
-- 1. CRIAR ÍNDICES PARA PERFORMANCE
-- ============================================

-- Índices compostos para queries frequentes em orders
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status_assigned 
ON orders(tenant_id, status, assigned_to);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_scheduled 
ON orders(tenant_id, scheduled_date)
WHERE status != 'CONCLUÍDO';

CREATE INDEX IF NOT EXISTS idx_orders_tenant_created 
ON orders(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_public_token 
ON orders(public_token) 
WHERE public_token IS NOT NULL;

-- Índices para customers
CREATE INDEX IF NOT EXISTS idx_customers_tenant_active 
ON customers(tenant_id, active);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_name 
ON customers(tenant_id, name);

CREATE INDEX IF NOT EXISTS idx_customers_document 
ON customers(tenant_id, document);

-- Índices para equipment
CREATE INDEX IF NOT EXISTS idx_equipment_tenant_customer 
ON equipment(tenant_id, customer_id);

CREATE INDEX IF NOT EXISTS idx_equipment_serial 
ON equipment(tenant_id, serial_number);

-- Índices para stock
CREATE INDEX IF NOT EXISTS idx_stock_tenant_location 
ON stock(tenant_id, location);

CREATE INDEX IF NOT EXISTS idx_stock_tenant_code 
ON stock(tenant_id, code);

CREATE INDEX IF NOT EXISTS idx_stock_low_quantity 
ON stock(tenant_id)
WHERE quantity <= min_quantity;

-- Índices para users
CREATE INDEX IF NOT EXISTS idx_users_tenant_role 
ON users(tenant_id, role);

CREATE INDEX IF NOT EXISTS idx_users_email 
ON users(email);

-- Índices para quotes
CREATE INDEX IF NOT EXISTS idx_quotes_tenant_status 
ON quotes(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_quotes_public_token 
ON quotes(public_token)
WHERE public_token IS NOT NULL;

-- ============================================
-- 2. ADICIONAR CONSTRAINTS DE VALIDAÇÃO
-- ============================================

-- Validar prioridade de orders
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_priority'
  ) THEN
    ALTER TABLE orders 
    ADD CONSTRAINT check_priority 
    CHECK (priority IN ('BAIXA', 'MÉDIA', 'ALTA', 'CRÍTICA'));
  END IF;
END $$;

-- Validar status de orders
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_status'
  ) THEN
    ALTER TABLE orders 
    ADD CONSTRAINT check_status 
    CHECK (status IN ('PENDENTE', 'ATRIBUÍDO', 'EM ANDAMENTO', 'CONCLUÍDO', 'CANCELADO', 'IMPEDIDO'));
  END IF;
END $$;

-- Validar datas de orders (apenas se as colunas existirem)
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'end_date'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'start_date'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'check_dates'
    ) THEN
      ALTER TABLE orders
      ADD CONSTRAINT check_dates
      CHECK (end_date IS NULL OR end_date >= start_date);
    END IF;
  END IF;
END $$;

-- Validar tipo de customer (se a tabela existir)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'check_customer_type'
    ) THEN
      ALTER TABLE customers 
      ADD CONSTRAINT check_customer_type 
      CHECK (type IN ('PF', 'PJ'));
    END IF;
  END IF;
END $$;

-- Validar estado (UF)
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customers' AND column_name = 'state'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'check_state'
    ) THEN
      ALTER TABLE customers 
      ADD CONSTRAINT check_state 
      CHECK (length(state) = 2);
    END IF;
  END IF;
END $$;

-- Validar CEP
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customers' AND column_name = 'zip'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'check_zip'
    ) THEN
      ALTER TABLE customers 
      ADD CONSTRAINT check_zip 
      CHECK (length(zip) = 8);
    END IF;
  END IF;
END $$;

-- Validar quantidades de stock
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stock') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'check_quantities'
    ) THEN
      ALTER TABLE stock
      ADD CONSTRAINT check_quantities
      CHECK (quantity >= 0 AND min_quantity >= 0);
    END IF;
  END IF;
END $$;

-- Validar preços de stock
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stock') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'check_prices'
    ) THEN
      ALTER TABLE stock
      ADD CONSTRAINT check_prices
      CHECK (cost_price >= 0 AND sell_price >= 0);
    END IF;
  END IF;
END $$;

-- Validar role de users
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_user_role'
  ) THEN
    ALTER TABLE users 
    ADD CONSTRAINT check_user_role 
    CHECK (role IN ('ADMIN', 'TECHNICIAN', 'SUPER_ADMIN'));
  END IF;
END $$;

-- ============================================
-- 3. CRIAR TABELA DE AUDIT LOG (SE NÃO EXISTIR)
-- ============================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_values JSONB,
  new_values JSONB,
  changed_by UUID REFERENCES users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT
);

-- Índice para audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_tenant_table 
ON audit_logs(tenant_id, table_name, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_record 
ON audit_logs(table_name, record_id, changed_at DESC);

-- ============================================
-- 4. CRIAR FUNÇÕES DE AUDITORIA
-- ============================================

-- Função genérica de auditoria
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    INSERT INTO audit_logs (
      tenant_id,
      table_name,
      record_id,
      action,
      old_values,
      changed_by
    ) VALUES (
      OLD.tenant_id,
      TG_TABLE_NAME,
      OLD.id,
      'DELETE',
      row_to_json(OLD),
      auth.uid()
    );
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO audit_logs (
      tenant_id,
      table_name,
      record_id,
      action,
      old_values,
      new_values,
      changed_by
    ) VALUES (
      NEW.tenant_id,
      TG_TABLE_NAME,
      NEW.id,
      'UPDATE',
      row_to_json(OLD),
      row_to_json(NEW),
      auth.uid()
    );
    RETURN NEW;
  ELSIF (TG_OP = 'INSERT') THEN
    INSERT INTO audit_logs (
      tenant_id,
      table_name,
      record_id,
      action,
      new_values,
      changed_by
    ) VALUES (
      NEW.tenant_id,
      TG_TABLE_NAME,
      NEW.id,
      'INSERT',
      row_to_json(NEW),
      auth.uid()
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. APLICAR TRIGGERS DE AUDITORIA
-- ============================================

-- Orders
DROP TRIGGER IF EXISTS audit_orders ON orders;
CREATE TRIGGER audit_orders
AFTER INSERT OR UPDATE OR DELETE ON orders
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Customers (se a tabela existir)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers') THEN
    DROP TRIGGER IF EXISTS audit_customers ON customers;
    CREATE TRIGGER audit_customers
    AFTER INSERT OR UPDATE OR DELETE ON customers
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
  END IF;
END $$;

-- Equipment (se a tabela existir)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'equipment') THEN
    DROP TRIGGER IF EXISTS audit_equipment ON equipment;
    CREATE TRIGGER audit_equipment
    AFTER INSERT OR UPDATE OR DELETE ON equipment
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
  END IF;
END $$;

-- Stock (se a tabela existir)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stock') THEN
    DROP TRIGGER IF EXISTS audit_stock ON stock;
    CREATE TRIGGER audit_stock
    AFTER INSERT OR UPDATE OR DELETE ON stock
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
  END IF;
END $$;

-- Users
DROP TRIGGER IF EXISTS audit_users ON users;
CREATE TRIGGER audit_users
AFTER INSERT OR UPDATE OR DELETE ON users
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Quotes (se a tabela existir)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quotes') THEN
    DROP TRIGGER IF EXISTS audit_quotes ON quotes;
    CREATE TRIGGER audit_quotes
    AFTER INSERT OR UPDATE OR DELETE ON quotes
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
  END IF;
END $$;

-- ============================================
-- 6. CRIAR FUNÇÃO DE LIMPEZA DE AUDIT LOGS
-- ============================================

-- Função para limpar logs antigos (>90 dias)
CREATE OR REPLACE FUNCTION clean_old_audit_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM audit_logs
  WHERE changed_at < NOW() - INTERVAL '90 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 7. OTIMIZAR RLS (Row Level Security)
-- ============================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Habilitar RLS em tabelas opcionais (se existirem)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers') THEN
    ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'equipment') THEN
    ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stock') THEN
    ALTER TABLE stock ENABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quotes') THEN
    ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Política para audit_logs (apenas admins podem ver)
DROP POLICY IF EXISTS "Admins can view audit logs" ON audit_logs;
CREATE POLICY "Admins can view audit logs" ON audit_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.tenant_id = audit_logs.tenant_id
    AND users.permissions->>'accessAdminPanel' = 'true'
  )
);

-- ============================================
-- 8. CRIAR VIEWS ÚTEIS
-- ============================================

-- View de estatísticas de orders por tenant
CREATE OR REPLACE VIEW order_stats_by_tenant AS
SELECT 
  tenant_id,
  COUNT(*) as total_orders,
  COUNT(*) FILTER (WHERE status = 'PENDENTE') as pending_orders,
  COUNT(*) FILTER (WHERE status = 'EM ANDAMENTO') as in_progress_orders,
  COUNT(*) FILTER (WHERE status = 'CONCLUÍDO') as completed_orders,
  COUNT(*) FILTER (WHERE status = 'CANCELADO') as cancelled_orders,
  AVG(EXTRACT(EPOCH FROM (end_date - start_date))/3600) FILTER (WHERE end_date IS NOT NULL AND start_date IS NOT NULL) as avg_duration_hours
FROM orders
GROUP BY tenant_id;

-- View de estoque baixo (se a tabela existir)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stock') THEN
    EXECUTE '
      CREATE OR REPLACE VIEW low_stock_items AS
      SELECT 
        s.*,
        (s.min_quantity - s.quantity) as shortage_quantity
      FROM stock s
      WHERE s.quantity <= s.min_quantity
        AND s.active = true
    ';
  END IF;
END $$;

-- View de ordens atrasadas
CREATE OR REPLACE VIEW overdue_orders AS
SELECT 
  o.*,
  EXTRACT(DAY FROM (NOW() - o.scheduled_date)) as days_overdue
FROM orders o
WHERE o.scheduled_date < NOW()
  AND o.status NOT IN ('CONCLUÍDO', 'CANCELADO');

-- ============================================
-- 9. GRANT PERMISSIONS
-- ============================================

-- Permitir que authenticated users vejam as views
GRANT SELECT ON order_stats_by_tenant TO authenticated;
GRANT SELECT ON overdue_orders TO authenticated;

-- Grant na view de stock baixo (se existir)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'low_stock_items') THEN
    GRANT SELECT ON low_stock_items TO authenticated;
  END IF;
END $$;

-- ============================================
-- 10. ANÁLISE E VACUUM
-- ============================================

-- Atualizar estatísticas
ANALYZE orders;
ANALYZE users;

-- Analisar tabelas opcionais
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers') THEN
    ANALYZE customers;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'equipment') THEN
    ANALYZE equipment;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stock') THEN
    ANALYZE stock;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quotes') THEN
    ANALYZE quotes;
  END IF;
END $$;

-- ============================================
-- VERIFICAÇÕES FINAIS
-- ============================================

-- Verificar índices criados
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('orders', 'customers', 'equipment', 'stock', 'users', 'quotes')
ORDER BY tablename, indexname;

-- Verificar constraints
SELECT 
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  cc.check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc 
  ON tc.constraint_name = cc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('orders', 'customers', 'equipment', 'stock', 'users', 'quotes')
ORDER BY tc.table_name, tc.constraint_type;

-- Verificar triggers
SELECT 
  trigger_name,
  event_object_table,
  action_timing,
  event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN ('orders', 'customers', 'equipment', 'stock', 'users', 'quotes')
ORDER BY event_object_table, trigger_name;

-- Sucesso!
SELECT '✅ Database setup completed successfully!' as status,
       COUNT(*) as indexes_created
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%';
