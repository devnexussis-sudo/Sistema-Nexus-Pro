-- Migration: Auto-resolve conversas do WhatsApp inativas por mais de 24 horas usando pg_cron

-- Habilitar a extensão pg_cron se não estiver habilitada
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  -- Remover o agendamento anterior se existir, para evitar duplicações
  PERFORM cron.unschedule('resolve-stale-whatsapp-conversations');
EXCEPTION WHEN OTHERS THEN
  -- Ignora caso a role não tenha permissão ou a job não exista
  NULL;
END $$;

-- Criar a rotina que roda uma vez por dia (às 03:00 da manhã UTC)
SELECT cron.schedule('resolve-stale-whatsapp-conversations', '0 3 * * *', $$
  UPDATE whatsapp_conversations
  SET state = 'RESOLVED',
      assigned_agent_id = NULL,
      history = history || jsonb_build_array(
        jsonb_build_object(
          'role', 'system',
          'content', 'Conversa encerrada automaticamente pelo sistema devido à inatividade (24h).',
          'timestamp', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )
      )
  WHERE state != 'RESOLVED'
    AND last_message_at < now() - interval '24 hours';
$$);
