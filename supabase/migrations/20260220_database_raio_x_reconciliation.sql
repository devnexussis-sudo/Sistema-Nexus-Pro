-- 🛡️ Nexus Pro - Master Database Reconciliation (X-Ray Fix)
-- Alinha o banco de dados Supabase com o TypeScript (Clean Architecture)
-- Versão V6 - Operacional & Resiliente

BEGIN;

-- ---------------------------------------------------------
-- 1. TABELA: quotes (Orçamentos) - Reconstrução Total
-- ---------------------------------------------------------
DO $$ 
BEGIN 
    -- 1.1 Alterar tipo da ID para TEXT (para IDs Soberanos ORC-XXXX)
    -- Nota: Fazemos isso com segurança para não quebrar PKs se possível
    IF (SELECT data_type FROM information_schema.columns WHERE table_name='quotes' AND column_name='id') = 'uuid' THEN
        -- Se houver FKs, elas precisam ser tratadas, mas aqui assumimos que estamos em fase de calibração
        ALTER TABLE public.quotes ALTER COLUMN id TYPE TEXT;
    END IF;

    -- 1.2 Renomear colunas antigas (Cleanup)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='total_amount') THEN
        ALTER TABLE public.quotes RENAME COLUMN total_amount TO total_value;
    END IF;

    -- 1.3 Adicionar Colunas Faltantes (Sincronia com database.ts)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='customer_name') THEN
        ALTER TABLE public.quotes ADD COLUMN customer_name TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='customer_address') THEN
        ALTER TABLE public.quotes ADD COLUMN customer_address TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='title') THEN
        ALTER TABLE public.quotes ADD COLUMN title TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='description') THEN
        ALTER TABLE public.quotes ADD COLUMN description TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='notes') THEN
        ALTER TABLE public.quotes ADD COLUMN notes TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='valid_until') THEN
        ALTER TABLE public.quotes ADD COLUMN valid_until TEXT; -- Armazenamos como string/ISO conforme TS
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='linked_order_id') THEN
        ALTER TABLE public.quotes ADD COLUMN linked_order_id TEXT;
    END IF;

    -- Campos de Aprovação
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='approved_by_name') THEN
        ALTER TABLE public.quotes ADD COLUMN approved_by_name TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='approval_document') THEN
        ALTER TABLE public.quotes ADD COLUMN approval_document TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='approval_birth_date') THEN
        ALTER TABLE public.quotes ADD COLUMN approval_birth_date TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='approval_signature') THEN
        ALTER TABLE public.quotes ADD COLUMN approval_signature TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='approved_at') THEN
        ALTER TABLE public.quotes ADD COLUMN approved_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='approval_metadata') THEN
        ALTER TABLE public.quotes ADD COLUMN approval_metadata JSONB DEFAULT '{}'::jsonb;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='approval_latitude') THEN
        ALTER TABLE public.quotes ADD COLUMN approval_latitude NUMERIC(10,8);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='approval_longitude') THEN
        ALTER TABLE public.quotes ADD COLUMN approval_longitude NUMERIC(11,8);
    END IF;

    -- Campos de Billing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='billing_status') THEN
        ALTER TABLE public.quotes ADD COLUMN billing_status TEXT DEFAULT 'PENDING';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='payment_method') THEN
        ALTER TABLE public.quotes ADD COLUMN payment_method TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='paid_at') THEN
        ALTER TABLE public.quotes ADD COLUMN paid_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='billing_notes') THEN
        ALTER TABLE public.quotes ADD COLUMN billing_notes TEXT;
    END IF;

    -- Resetar Constraints se necessário
    ALTER TABLE public.quotes ALTER COLUMN items SET DEFAULT '[]'::jsonb;
    ALTER TABLE public.quotes ALTER COLUMN status SET DEFAULT 'ABERTO';

END $$;

-- ---------------------------------------------------------
-- 2. TABELA: technicians (Técnicos) - Alinhamento
-- ---------------------------------------------------------
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='technicians' AND column_name='email') THEN
        ALTER TABLE public.technicians ADD COLUMN email TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='technicians' AND column_name='phone') THEN
        ALTER TABLE public.technicians ADD COLUMN phone TEXT;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='technicians' AND column_name='last_seen_at') THEN
        ALTER TABLE public.technicians RENAME COLUMN last_seen_at TO last_seen;
    END IF;

    -- Garantir coluna active
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='technicians' AND column_name='active') THEN
        ALTER TABLE public.technicians ADD COLUMN active BOOLEAN DEFAULT true;
    END IF;
END $$;

-- ---------------------------------------------------------
-- 3. TABELA: customers (Clientes) - Cleanup
-- ---------------------------------------------------------
DO $$ 
BEGIN 
    -- Alinha 'zip_code' com 'zip' do TypeScript
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='zip_code') THEN
        ALTER TABLE public.customers RENAME COLUMN zip_code TO zip;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='zip') THEN
        ALTER TABLE public.customers ADD COLUMN zip TEXT;
    END IF;
END $$;

-- ---------------------------------------------------------
-- 4. TABELA: users (Sincronia Global)
-- ---------------------------------------------------------
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='avatar') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='avatar_url') THEN
            ALTER TABLE public.users RENAME COLUMN avatar_url TO avatar;
        ELSE
            ALTER TABLE public.users ADD COLUMN avatar TEXT;
        END IF;
    END IF;
END $$;

-- ---------------------------------------------------------
-- 5. TABELA: orders (Alinhamento de Execução)
-- ---------------------------------------------------------
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='equipment_name') THEN
        ALTER TABLE public.orders ADD COLUMN equipment_name TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='equipment_model') THEN
        ALTER TABLE public.orders ADD COLUMN equipment_model TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='equipment_serial') THEN
        ALTER TABLE public.orders ADD COLUMN equipment_serial TEXT;
    END IF;
END $$;

COMMIT;
