-- =========================================================================
-- ⚡ MIGRATION: Habilitar Supabase Realtime CDC para tabelas Financeiras e OS
-- =========================================================================
-- Sem essa instrução SQL executada no Supabase, os eventos postgres_changes
-- para faturas, parcelas, fluxo de caixa e OS são descartados silenciosamente
-- pela publicação supabase_realtime.
-- =========================================================================

DO $$
BEGIN
    -- 1. invoices
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'invoices'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
    END IF;

    -- 2. invoice_installments
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'invoice_installments'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.invoice_installments;
    END IF;

    -- 3. orders
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
    END IF;

    -- 4. quotes
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'quotes'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.quotes;
    END IF;

    -- 5. cash_flow
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'cash_flow'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_flow;
    END IF;
END $$;

-- ⚡ REPLICA IDENTITY FULL garante que os streams do WAL enviem todas as colunas (especialmente tenant_id)
-- Isso possibilita que os filtros por tenant (filter: tenant_id=eq.X) funcionem em UPDATE e DELETE.
ALTER TABLE public.invoices REPLICA IDENTITY FULL;
ALTER TABLE public.invoice_installments REPLICA IDENTITY FULL;
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.quotes REPLICA IDENTITY FULL;
ALTER TABLE public.cash_flow REPLICA IDENTITY FULL;
