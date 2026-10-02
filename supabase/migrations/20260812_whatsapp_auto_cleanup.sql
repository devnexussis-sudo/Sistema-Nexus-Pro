-- ═══════════════════════════════════════════════════════════════════
-- WhatsApp Bot — 30 Days Auto-Cleanup (pg_cron)
-- ═══════════════════════════════════════════════════════════════════

-- Habilita a extensão do cron (se não estiver habilitada)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove qualquer agendamento anterior para garantir idempotência
DO $$
BEGIN
  PERFORM cron.unschedule('clean-old-whatsapp-conversations');
EXCEPTION WHEN OTHERS THEN
  -- Ignora se der erro na primeira execução
END $$;

-- Agendar limpeza automática diariamente às 03:00 da manhã
-- Deleta registros de conversas onde a última mensagem ocorreu há mais de 30 dias
SELECT cron.schedule('clean-old-whatsapp-conversations', '0 3 * * *', $$
  DELETE FROM whatsapp_conversations
  WHERE last_message_at < NOW() - INTERVAL '30 days';
$$);
