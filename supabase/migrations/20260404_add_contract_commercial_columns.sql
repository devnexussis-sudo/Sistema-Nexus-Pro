-- 🏗️ NEXUS PRO - SCHEMA UPDATE: CONTRACTS
-- Adiciona colunas para Alertas e Faturamento Comercial
-- Data: 2026-04-03 21:12:10 (Local)

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'alert_settings') THEN
        ALTER TABLE contracts ADD COLUMN alert_settings JSONB DEFAULT '{"enabled": false, "days_before": 5, "frequency": 1}';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'contract_value') THEN
        ALTER TABLE contracts ADD COLUMN contract_value NUMERIC(15,2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'includes_parts') THEN
        ALTER TABLE contracts ADD COLUMN includes_parts BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'visit_count') THEN
        ALTER TABLE contracts ADD COLUMN visit_count INTEGER DEFAULT 1;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'contract_terms') THEN
        ALTER TABLE contracts ADD COLUMN contract_terms TEXT DEFAULT '';
    END IF;
END $$;

COMMENT ON TABLE contracts IS 'Nexus Pro: Tabela de contratos master com suporte a alertas e faturamento comercial.';
