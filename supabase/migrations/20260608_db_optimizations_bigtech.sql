-- =========================================================================
-- MIGRATION: BIG TECH DATABASE OPTIMIZATION & LIFECYCLE MANAGEMENT
-- Descrição: Ativação de pg_cron, limpeza de telemetria antiga, 
--            arquivamento de logs de auditoria e manutenção de banco.
-- =========================================================================

BEGIN;

-- 1. Ativar pg_cron na schema extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- 2. GPS Telemetry Lifecycle (Excluir pings com mais de 30 dias)
CREATE OR REPLACE FUNCTION public.prune_old_gps_pings()
RETURNS void AS $$
BEGIN
    -- Deleta registros de GPS muito antigos para evitar table bloat
    DELETE FROM public.technician_gps_pings
    WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Audit Logs Lifecycle (Excluir logs com mais de 90 dias)
CREATE OR REPLACE FUNCTION public.prune_audit_logs()
RETURNS void AS $$
BEGIN
    -- Deleta logs de auditoria antigos usando a coluna changed_at
    DELETE FROM public.audit_logs
    WHERE changed_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

-- 4. Agendamento dos Jobs no pg_cron
-- Remove jobs antigos se existirem para evitar duplicatas (não transacional)
SELECT cron.unschedule('prune_gps_job');
SELECT cron.unschedule('prune_audit_job');
SELECT cron.unschedule('vacuum_maintenance_job');

-- Agendar limpeza de GPS todos os dias às 03:00 AM
SELECT cron.schedule('prune_gps_job', '0 3 * * *', 'SELECT public.prune_old_gps_pings();');

-- Agendar limpeza de Audit Logs aos Domingos às 04:00 AM
SELECT cron.schedule('prune_audit_job', '0 4 * * 0', 'SELECT public.prune_audit_logs();');

-- Agendar VACUUM ANALYZE para otimização de índices (incluindo pgvector)
-- Roda todo Sábado às 02:00 AM
SELECT cron.schedule('vacuum_maintenance_job', '0 2 * * 6', 'VACUUM ANALYZE public.technician_gps_pings; VACUUM ANALYZE public.audit_logs; VACUUM ANALYZE public.ai_knowledge_base;');
