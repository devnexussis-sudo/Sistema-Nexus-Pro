-- 🛡️ Nexus Pro - Migration: Add Notes column to Orders
-- Objetivo: Resolver o erro "could not find the 'Notes' column" e alinhar com o TS.
-- Observação: O erro no front reportava 'Notes' (maiúsculo) possivelmente por conta de 
-- como o PostgREST ou o client interpreta a falta da coluna. 

BEGIN;

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='notes') THEN
        ALTER TABLE public.orders ADD COLUMN notes TEXT;
        COMMENT ON COLUMN public.orders.notes IS 'Notas internas ou de encerramento da OS.';
    END IF;
END $$;

COMMIT;
