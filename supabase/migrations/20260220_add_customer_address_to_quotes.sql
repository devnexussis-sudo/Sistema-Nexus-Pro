-- 🛠️ Nexus Pro - Hotfix de Esquema (Tabela Quotes)
-- Este script adiciona a coluna 'customer_address' caso ela esteja faltando,
-- garantindo a compatibilidade com o QuoteService.

BEGIN;

-- Adiciona colunas se não existirem
DO $$ 
BEGIN 
    -- Endereço
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='customer_address') THEN
        ALTER TABLE public.quotes ADD COLUMN customer_address TEXT;
    END IF;

    -- Campos de Aprovação e Metadados (Big Tech Audit)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='public_token') THEN
        ALTER TABLE public.quotes ADD COLUMN public_token UUID DEFAULT gen_random_uuid();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='approval_metadata') THEN
        ALTER TABLE public.quotes ADD COLUMN approval_metadata JSONB DEFAULT '{}'::jsonb;
    END IF;

    -- Campos de Faturamento (Billing)
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
END $$;

COMMIT;
