-- ============================================
-- 🚨 FIX DEFINITIVO: AUDIT LOGS (TEXT ID)
-- record_id agora é TEXT para aceitar UUIDs e Strings sem erro de conversão
-- ============================================

-- 1. Reset da Tabela
DROP TABLE IF EXISTS audit_logs CASCADE;

-- 2. Criar Nova Tabela (Flexível)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL, -- AGORA É TEXT (Aceita UUID implícito)
  action TEXT NOT NULL, 
  old_values JSONB,
  new_values JSONB,
  changed_by UUID REFERENCES users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT
);

-- 3. Índices
CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id, table_name, changed_at DESC);
CREATE INDEX idx_audit_logs_record ON audit_logs(table_name, record_id);

-- 4. Segurança
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 5. Política de Acesso
CREATE POLICY "Admins can view audit logs" ON audit_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.tenant_id = audit_logs.tenant_id
    AND (
        users.role = 'ADMIN' 
        OR (users.permissions->>'accessAdminPanel')::boolean = true
    )
  )
);

-- 6. Recarregar Schema
NOTIFY pgrst, 'reload schema';
