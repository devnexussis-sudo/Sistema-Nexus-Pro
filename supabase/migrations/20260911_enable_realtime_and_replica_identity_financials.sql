-- Migration: Enable Realtime and REPLICA IDENTITY FULL for all financial tables
-- Date: 2026-09-11
-- Ensures invoices, invoice_installments, cash_flow, invoice_nfse, quotes, and orders
-- are safely in publication 'supabase_realtime' and broadcast tenant_id on UPDATE/DELETE.

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

    -- 3. cash_flow
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'cash_flow'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_flow;
    END IF;

    -- 4. invoice_nfse
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'invoice_nfse'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.invoice_nfse;
    END IF;

    -- 5. quotes
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'quotes'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.quotes;
    END IF;

    -- 6. orders
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
    END IF;
END $$;

-- Set REPLICA IDENTITY FULL so WAL streams include all columns (especially tenant_id) on UPDATE & DELETE
ALTER TABLE public.invoices REPLICA IDENTITY FULL;
ALTER TABLE public.invoice_installments REPLICA IDENTITY FULL;
ALTER TABLE public.cash_flow REPLICA IDENTITY FULL;
ALTER TABLE public.invoice_nfse REPLICA IDENTITY FULL;
ALTER TABLE public.quotes REPLICA IDENTITY FULL;
ALTER TABLE public.orders REPLICA IDENTITY FULL;
