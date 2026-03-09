-- ============================================
-- 🔧 NEXUS PRO - SUPABASE DATABASE SETUP
-- VERSÃO ULTRA SEGURA - SÓ TABELAS EXISTENTES
-- ============================================
-- Execute este script no Supabase SQL Editor

-- ============================================
-- 1. ÍNDICES PARA ORDERS (TABELA PRINCIPAL)
-- ============================================

-- Índices compostos para queries frequentes
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

CREATE INDEX IF NOT EXISTS idx_orders_status
ON orders(status);

-- ============================================
-- 2. ÍNDICES PARA USERS
-- ============================================

CREATE INDEX IF NOT EXISTS idx_users_tenant_role 
ON users(tenant_id, role);

CREATE INDEX IF NOT EXISTS idx_users_email 
ON users(email);

CREATE INDEX IF NOT EXISTS idx_users_tenant_active
ON users(tenant_id, active);

-- ============================================
-- 3. CONSTRAINTS DE VALIDAÇÃO - ORDERS
-- ============================================

-- Validar prioridade
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

-- Validar status
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

-- ============================================
-- 4. CRIAR TABELA DE AUDIT LOG
-- ============================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_values JSONB,
  new_values JSONB,
  changed_by UUID,
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
-- 5. FUNÇÃO DE AUDITORIA
-- ============================================

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
-- 6. TRIGGERS DE AUDITORIA
-- ============================================

-- Trigger para orders
DROP TRIGGER IF EXISTS audit_orders ON orders;
CREATE TRIGGER audit_orders
AFTER INSERT OR UPDATE OR DELETE ON orders
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Trigger para users
DROP TRIGGER IF EXISTS audit_users ON users;
CREATE TRIGGER audit_users
AFTER INSERT OR UPDATE OR DELETE ON users
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ============================================
-- 7. FUNÇÃO DE LIMPEZA DE LOGS ANTIGOS
-- ============================================

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
-- 8. RLS (ROW LEVEL SECURITY)
-- ============================================

-- Habilitar RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Política para audit_logs (apenas admins)
DROP POLICY IF EXISTS "Admins can view audit logs" ON audit_logs;
CREATE POLICY "Admins can view audit logs" ON audit_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND (
      users.permissions->>'accessAdminPanel' = 'true'
      OR users.role = 'ADMIN'
      OR users.role = 'SUPER_ADMIN'
    )
  )
);

-- ============================================
-- 9. VIEWS ÚTEIS
-- ============================================

-- View de estatísticas de orders por tenant
CREATE OR REPLACE VIEW order_stats_by_tenant AS
SELECT 
  tenant_id,
  COUNT(*) as total_orders,
  COUNT(*) FILTER (WHERE status = 'PENDENTE') as pending_orders,
  COUNT(*) FILTER (WHERE status = 'EM ANDAMENTO') as in_progress_orders,
  COUNT(*) FILTER (WHERE status = 'CONCLUÍDO') as completed_orders,
  COUNT(*) FILTER (WHERE status = 'CANCELADO') as cancelled_orders
FROM orders
GROUP BY tenant_id;

-- View de ordens atrasadas
CREATE OR REPLACE VIEW overdue_orders AS
SELECT 
  o.*,
  EXTRACT(DAY FROM (NOW() - o.scheduled_date))::INTEGER as days_overdue
FROM orders o
WHERE o.scheduled_date < NOW()
  AND o.status NOT IN ('CONCLUÍDO', 'CANCELADO');

-- ============================================
-- 10. PERMISSIONS NAS VIEWS
-- ============================================

GRANT SELECT ON order_stats_by_tenant TO authenticated;
GRANT SELECT ON overdue_orders TO authenticated;

-- ============================================
-- 11. ANÁLISE DE PERFORMANCE
-- ============================================

ANALYZE orders;
ANALYZE users;
ANALYZE audit_logs;

-- ============================================
-- 12. VERIFICAÇÕES FINAIS
-- ============================================

-- Mostrar índices criados
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- Mostrar constraints criados
SELECT 
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type
FROM information_schema.table_constraints tc
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('orders', 'users', 'audit_logs')
ORDER BY tc.table_name, tc.constraint_type;

-- Mostrar triggers criados
SELECT 
  trigger_name,
  event_object_table,
  action_timing,
  event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- Sucesso!
SELECT 
  '✅ Database setup completed successfully!' as status,
  (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'idx_%') as indexes_created,
  (SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema = 'public' AND trigger_name LIKE 'audit_%') as triggers_created;
