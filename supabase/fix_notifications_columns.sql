-- ==============================================================================
-- FIX COMPLETO: system_notifications - todas as colunas faltantes
-- ==============================================================================

-- Verifica e adiciona TODAS as colunas que o código espera
ALTER TABLE public.system_notifications 
    ADD COLUMN IF NOT EXISTS priority text DEFAULT 'info';

ALTER TABLE public.system_notifications 
    ADD COLUMN IF NOT EXISTS target_tenants uuid[] DEFAULT NULL;

-- A coluna 'type' pode já existir mas com nome diferente ou não existir
-- Vamos garantir que exista exatamente como o código espera
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'system_notifications' 
        AND column_name = 'type'
    ) THEN
        ALTER TABLE public.system_notifications ADD COLUMN type text DEFAULT 'broadcast';
    END IF;
END $$;

-- Garantir que a coluna 'content' existe
ALTER TABLE public.system_notifications 
    ADD COLUMN IF NOT EXISTS content text;

-- Policies para o Master Admin (anon)
DROP POLICY IF EXISTS "notifications_anon_insert" ON public.system_notifications;
CREATE POLICY "notifications_anon_insert" ON public.system_notifications
    FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "notifications_anon_read" ON public.system_notifications;
CREATE POLICY "notifications_anon_read" ON public.system_notifications
    FOR SELECT TO anon USING (true);

GRANT ALL ON TABLE public.system_notifications TO anon;
GRANT ALL ON TABLE public.system_notification_reads TO anon;

-- IMPORTANTE: Recarregar o cache do PostgREST para reconhecer as novas colunas
NOTIFY pgrst, 'reload schema';
