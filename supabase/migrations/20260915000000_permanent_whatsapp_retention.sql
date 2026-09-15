-- ═══════════════════════════════════════════════════════════════════
-- WhatsApp Inbox — Retenção Permanente Indefinida
-- Garante que NENHUMA conversa ou mensagem antiga seja deletada
-- ═══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  -- Unschedules any auto-cleanup cron tasks for whatsapp conversations
  PERFORM cron.unschedule('clean-old-whatsapp-conversations');
EXCEPTION WHEN OTHERS THEN
  -- Ignora se a extensão cron não estiver ativa ou a job não existir
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('clean-old-whatsapp-messages');
EXCEPTION WHEN OTHERS THEN
END $$;

-- Garante que o histórico e as mensagens permaneçam indefinidamente no banco de dados
COMMENT ON TABLE whatsapp_conversations IS 'Guarda o cadastro e estado permanente de todas as conversas do WhatsApp (sem expiração).';
COMMENT ON TABLE whatsapp_messages IS 'Guarda o histórico permanente de todas as mensagens do WhatsApp (sem expiração).';
