-- Migration: Enable Realtime CDC for remaining tables used by AdminApp
-- Date: 2026-09-25
--
-- AdminApp.tsx listens to postgres_changes on customers, technicians,
-- equipments, and stock_categories, but these tables were never added
-- to the supabase_realtime publication. Without this, CDC events are
-- silently dropped and the admin panel never receives live updates.

DO $$
BEGIN
    -- 1. customers
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'customers'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
    END IF;

    -- 2. technicians
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'technicians'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.technicians;
    END IF;

    -- 3. equipments
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'equipments'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.equipments;
    END IF;

    -- 4. stock_categories
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'stock_categories'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_categories;
    END IF;
END $$;

-- Set REPLICA IDENTITY FULL so WAL streams include all columns (especially tenant_id)
-- Required for server-side filtering (filter: `tenant_id=eq.${tid}`) to work on UPDATE/DELETE
ALTER TABLE public.customers REPLICA IDENTITY FULL;
ALTER TABLE public.technicians REPLICA IDENTITY FULL;
ALTER TABLE public.equipments REPLICA IDENTITY FULL;
ALTER TABLE public.stock_categories REPLICA IDENTITY FULL;
