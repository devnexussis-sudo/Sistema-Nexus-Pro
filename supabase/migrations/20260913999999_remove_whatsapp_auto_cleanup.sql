-- ═══════════════════════════════════════════════════════════════════
-- WhatsApp Bot — Remove Auto-Cleanup (pg_cron)
-- ═══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('clean-old-whatsapp-conversations');
EXCEPTION WHEN OTHERS THEN
  -- Ignora caso a rotina já tenha sido removida
END $$;
