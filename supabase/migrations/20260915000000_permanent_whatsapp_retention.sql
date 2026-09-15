-- ═══════════════════════════════════════════════════════════════════
-- WhatsApp Inbox — Retenção Permanente Indefinida e Preservação de Estado
-- Garante que NENHUMA conversa seja deletada nem auto-encerrada da lista
-- ═══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  -- Cancelar rotina de deleção de conversas antigas
  PERFORM cron.unschedule('clean-old-whatsapp-conversations');
EXCEPTION WHEN OTHERS THEN
END $$;

DO $$
BEGIN
  -- Cancelar rotina de deleção de mensagens antigas
  PERFORM cron.unschedule('clean-old-whatsapp-messages');
EXCEPTION WHEN OTHERS THEN
END $$;

DO $$
BEGIN
  -- Cancelar rotina de auto-encetramento (resolve-stale) por inatividade
  PERFORM cron.unschedule('resolve-stale-whatsapp-conversations');
EXCEPTION WHEN OTHERS THEN
END $$;

-- Garante que o histórico e as mensagens permaneçam indefinidamente no banco de dados
COMMENT ON TABLE whatsapp_conversations IS 'Guarda o cadastro e estado permanente de todas as conversas do WhatsApp (sem expiração).';
COMMENT ON TABLE whatsapp_messages IS 'Guarda o histórico permanente de todas as mensagens do WhatsApp (sem expiração).';
