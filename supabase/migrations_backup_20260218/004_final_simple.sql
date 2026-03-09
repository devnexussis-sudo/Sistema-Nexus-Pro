-- ============================================
-- 🔧 NEXUS PRO - SUPABASE DATABASE SETUP
-- VERSÃO SIMPLES E FUNCIONAL
-- ============================================

-- ============================================
-- 1. ÍNDICES PARA ORDERS
-- ============================================

CREATE INDEX IF NOT EXISTS idx_orders_tenant_status_assigned 
ON orders(tenant_id, status, assigned_to);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_scheduled 
ON orders(tenant_id, scheduled_date);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_created 
ON orders(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_public_token 
ON orders(public_token);

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
-- 3. CONSTRAINTS DE VALIDAÇÃO
-- ============================================

-- Prioridade (orders)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_priority') THEN
    ALTER TABLE orders ADD CONSTRAINT check_priority 
    CHECK (priority IN ('BAIXA', 'MÉDIA', 'ALTA', 'CRÍTICA'));
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL; -- Ignora se já existe
END $$;

-- Status (orders)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_status') THEN
    ALTER TABLE orders ADD CONSTRAINT check_status 
    CHECK (status IN ('PENDENTE', 'ATRIBUÍDO', 'EM ANDAMENTO', 'CONCLUÍDO', 'CANCELADO', 'IMPEDIDO'));
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ============================================
-- 4. TABELA DE AUDIT LOG
-- ============================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL,
  old_values JSONB,
  new_values JSONB,
  changed_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_tenant_table 
ON audit_logs(tenant_id, table_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_record 
ON audit_logs(table_name, record_id);

-- ============================================
-- 5. FUNÇÃO DE AUDITORIA
-- ============================================

CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
  user_id UUID;
BEGIN
  -- Tentar pegar o ID do usuário autenticado
  BEGIN
    user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    user_id := NULL;
  END;

  IF (TG_OP = 'DELETE') THEN
    INSERT INTO audit_logs (tenant_id, table_name, record_id, action, old_values, changed_by)
    VALUES (OLD.tenant_id, TG_TABLE_NAME, OLD.id, 'DELETE', row_to_json(OLD), user_id);
    RETURN OLD;
    
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO audit_logs (tenant_id, table_name, record_id, action, old_values, new_values, changed_by)
    VALUES (NEW.tenant_id, TG_TABLE_NAME, NEW.id, 'UPDATE', row_to_json(OLD), row_to_json(NEW), user_id);
    RETURN NEW;
    
  ELSIF (TG_OP = 'INSERT') THEN
    INSERT INTO audit_logs (tenant_id, table_name, record_id, action, new_values, changed_by)
    VALUES (NEW.tenant_id, TG_TABLE_NAME, NEW.id, 'INSERT', row_to_json(NEW), user_id);
    RETURN NEW;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. TRIGGERS
-- ============================================

DROP TRIGGER IF EXISTS audit_orders ON orders;
CREATE TRIGGER audit_orders
AFTER INSERT OR UPDATE OR DELETE ON orders
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

DROP TRIGGER IF EXISTS audit_users ON users;
CREATE TRIGGER audit_users
AFTER INSERT OR UPDATE OR DELETE ON users
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ============================================
-- 7. FUNÇÃO DE LIMPEZA
-- ============================================

CREATE OR REPLACE FUNCTION clean_old_audit_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 8. RLS
-- ============================================

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 9. VIEWS
-- ============================================

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

CREATE OR REPLACE VIEW overdue_orders AS
SELECT 
  o.id,
  o.tenant_id,
  o.title,
  o.status,
  o.scheduled_date,
  EXTRACT(DAY FROM (NOW() - o.scheduled_date))::INTEGER as days_overdue
FROM orders o
WHERE o.scheduled_date < NOW()
  AND o.status NOT IN ('CONCLUÍDO', 'CANCELADO');

-- ============================================
-- 10. PERMISSIONS
-- ============================================

GRANT SELECT ON order_stats_by_tenant TO authenticated;
GRANT SELECT ON overdue_orders TO authenticated;

-- ============================================
-- 11. ANÁLISE
-- ============================================

ANALYZE orders;
ANALYZE users;

-- ============================================
-- SUCESSO!
-- ============================================

SELECT '✅ Otimizações aplicadas com sucesso!' as mensagem;
