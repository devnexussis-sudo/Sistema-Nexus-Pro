-- ==============================================================================
-- MIGRATION: LIMPEZA AUTOMÁTICA DIÁRIA DE DADOS DE GPS (01:00 AM)
-- ==============================================================================
-- Objetivo: Resetar dados de localização em tempo real e esvaziar a tabela de pings
-- diariamente às 01:00 da manhã para economizar espaço em disco no Supabase.
-- ==============================================================================

BEGIN;

-- 1. Criar função de limpeza dos dados de GPS
CREATE OR REPLACE FUNCTION public.clean_daily_gps_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Resetar localização atual na tabela de técnicos
  UPDATE public.technicians
  SET 
    last_latitude = NULL,
    last_longitude = NULL,
    last_seen = NULL,
    motion_state = NULL;

  -- Truncar/Limpar histórico legado da tabela de pings de GPS (se existir)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'technician_gps_pings') THEN
    TRUNCATE TABLE public.technician_gps_pings;
  END IF;

  RAISE NOTICE 'Dados de GPS resetados com sucesso.';
END;
$$;

-- Permissão para execução
GRANT EXECUTE ON FUNCTION public.clean_daily_gps_data() TO service_role;
GRANT EXECUTE ON FUNCTION public.clean_daily_gps_data() TO postgres;

-- 2. Configuração do agendamento diário via pg_cron (às 01:00 AM todos os dias)
-- Certifique-se de que a extensão pg_cron está habilitada no Supabase (Database -> Extensions)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remover agendamento anterior se já existir
SELECT cron.unschedule('daily-gps-cleanup') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily-gps-cleanup'
);

-- Agendar para rodar diariamente às 01:00 AM ('0 1 * * *')
SELECT cron.schedule(
  'daily-gps-cleanup',
  '0 1 * * *',
  $$ SELECT public.clean_daily_gps_data(); $$
);

COMMIT;
