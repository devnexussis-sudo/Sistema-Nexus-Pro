-- 🏗️ NEXUS PRO - NUCLEAR SCHEMA REPAIR: CONTRACTS
-- Restaura colunas básicas e avançadas para o módulo de Contratos/PMOC
-- Data: 2026-04-03 21:15:43 (Local)

DO $$ BEGIN
    -- Colunas Básicas de Identificação
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'customer_name') THEN
        ALTER TABLE contracts ADD COLUMN customer_name TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'customer_address') THEN
        ALTER TABLE contracts ADD COLUMN customer_address TEXT;
    END IF;

    -- Colunas de Operação/PMOC
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'operation_type') THEN
        ALTER TABLE contracts ADD COLUMN operation_type TEXT DEFAULT 'Manutenção Preventiva';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'periodicity') THEN
        ALTER TABLE contracts ADD COLUMN periodicity TEXT DEFAULT 'Mensal';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'maintenance_day') THEN
        ALTER TABLE contracts ADD COLUMN maintenance_day INTEGER DEFAULT 1;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'equipment_ids') THEN
        ALTER TABLE contracts ADD COLUMN equipment_ids JSONB DEFAULT '[]';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'logs') THEN
        ALTER TABLE contracts ADD COLUMN logs JSONB DEFAULT '[]';
    END IF;

    -- Colunas de Alertas e Faturamento Comercial
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

-- Comentário para auditoria de schema cache
COMMENT ON TABLE contracts IS 'Nexus Pro: Tabela de contratos master completa com suporte a PMOC, Alertas e Faturamento Comercial.';
