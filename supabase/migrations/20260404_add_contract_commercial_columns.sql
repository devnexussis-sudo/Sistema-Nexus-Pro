-- 🏗️ NEXUS PRO - PMOC CODE & UUID FIX
-- Corrige o erro de sintaxe UUID e adiciona suporte a Código PMOC customizado
-- Data: 2026-04-03 21:22:52 (Local)

DO $$ BEGIN
    -- Coluna de exibição customizada (para evitar erro de UUID no ID principal)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'display_id') THEN
        ALTER TABLE contracts ADD COLUMN display_id TEXT;
        CREATE INDEX IF NOT EXISTS idx_contracts_display_id ON contracts(display_id);
    END IF;

    -- Garantir que as colunas estruturais existam
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'title') THEN
        ALTER TABLE contracts ADD COLUMN title TEXT DEFAULT 'Contrato Master';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'description') THEN
        ALTER TABLE contracts ADD COLUMN description TEXT DEFAULT '';
    END IF;

    -- Cliente
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'customer_name') THEN
        ALTER TABLE contracts ADD COLUMN customer_name TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'customer_address') THEN
        ALTER TABLE contracts ADD COLUMN customer_address TEXT;
    END IF;

    -- Estado e Prioridade
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'status') THEN
        ALTER TABLE contracts ADD COLUMN status TEXT DEFAULT 'PENDENTE';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'priority') THEN
        ALTER TABLE contracts ADD COLUMN priority TEXT DEFAULT 'MÉDIA';
    END IF;

    -- Operação/PMOC
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'operation_type') THEN
        ALTER TABLE contracts ADD COLUMN operation_type TEXT DEFAULT 'Manutenção Preventiva';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'scheduled_date') THEN
        ALTER TABLE contracts ADD COLUMN scheduled_date DATE DEFAULT CURRENT_DATE;
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

    -- Alertas e Comercial
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

    -- Auditoria
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'created_at') THEN
        ALTER TABLE contracts ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'updated_at') THEN
        ALTER TABLE contracts ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;

END $$;

COMMENT ON TABLE contracts IS 'Nexus Pro: Tabela de contratos master com suporte a display_id customizado (PMOC-XXXXX) e UUID nativo.';
