-- ============================================================================
-- Migration: commission_rules
-- Tabela de regras de comissão por técnico (multi-tenant)
-- ============================================================================

CREATE TABLE IF NOT EXISTS commission_rules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    technician_id UUID NOT NULL,
    technician_name TEXT NOT NULL,

    -- Regra para OS concluída
    completed_type TEXT NOT NULL DEFAULT 'fixed' CHECK (completed_type IN ('fixed', 'percent')),
    completed_value NUMERIC(12,2) NOT NULL DEFAULT 0,

    -- Regra para OS impedida
    blocked_type TEXT NOT NULL DEFAULT 'fixed' CHECK (blocked_type IN ('fixed', 'percent')),
    blocked_value NUMERIC(12,2) NOT NULL DEFAULT 0,

    -- Controle
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE (tenant_id, technician_id)
);

-- RLS
ALTER TABLE commission_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commission_rules_select" ON commission_rules
    FOR SELECT USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "commission_rules_insert" ON commission_rules
    FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "commission_rules_update" ON commission_rules
    FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "commission_rules_delete" ON commission_rules
    FOR DELETE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
