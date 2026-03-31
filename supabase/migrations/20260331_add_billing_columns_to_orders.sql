-- =========================================================================
-- MIGRATION: ADD BILLING COLUMNS TO ORDERS TABLE
-- Descrição: Garante que a tabela 'orders' tenha as mesmas colunas de 
--            faturamento que já existem na tabela 'quotes'.
--            Sem essas colunas, o updateOrder() silenciosamente descartava
--            os campos billing_status, payment_method, paid_at e billing_notes.
-- =========================================================================

DO $$
BEGIN
    -- 1. billing_status (Status do faturamento: PENDING / PAID)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='billing_status') THEN
        ALTER TABLE public.orders ADD COLUMN billing_status TEXT DEFAULT 'PENDING';
        RAISE NOTICE '✅ Coluna billing_status adicionada à tabela orders';
    END IF;

    -- 2. payment_method (Pix, Dinheiro, Cartão Crédito 3x, etc.)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='payment_method') THEN
        ALTER TABLE public.orders ADD COLUMN payment_method TEXT;
        RAISE NOTICE '✅ Coluna payment_method adicionada à tabela orders';
    END IF;

    -- 3. paid_at (Data/hora em que o pagamento foi confirmado)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='paid_at') THEN
        ALTER TABLE public.orders ADD COLUMN paid_at TIMESTAMPTZ;
        RAISE NOTICE '✅ Coluna paid_at adicionada à tabela orders';
    END IF;

    -- 4. billing_notes (Observações do faturamento: nº comprovante, etc.)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='billing_notes') THEN
        ALTER TABLE public.orders ADD COLUMN billing_notes TEXT;
        RAISE NOTICE '✅ Coluna billing_notes adicionada à tabela orders';
    END IF;
END $$;

-- Index para consultas rápidas de faturamento pendente
CREATE INDEX IF NOT EXISTS idx_orders_billing_status ON public.orders(billing_status);
