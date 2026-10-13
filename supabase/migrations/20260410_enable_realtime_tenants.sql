-- ⚡ Enable Realtime Publication for public.tenants
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
    
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.tenants;
    EXCEPTION WHEN OTHERS THEN
        -- Table already in publication or permission error
        NULL;
    END;
END $$;
