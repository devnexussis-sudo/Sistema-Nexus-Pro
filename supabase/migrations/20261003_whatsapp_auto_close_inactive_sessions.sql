-- ═══════════════════════════════════════════════════════════════════
-- WhatsApp Bot — Encerramento Automático de Conversas Inativas (12h)
-- Encerra conversas (bot ou colaborador humano) sem apagar o histórico
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.close_inactive_whatsapp_conversations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_closed_count INTEGER := 0;
  v_conv RECORD;
BEGIN
  -- Percorre conversas ativas ou aguardando que estejam sem mensagens há mais de 12 horas
  FOR v_conv IN
    SELECT id, tenant_id, last_message_at
    FROM public.whatsapp_conversations
    WHERE state NOT IN ('RESOLVED', 'CLOSED')
      AND last_message_at < (NOW() - INTERVAL '12 hours')
  LOOP
    -- 1. Insere evento de sistema na tabela dedicada whatsapp_messages (preservando todo o histórico)
    INSERT INTO public.whatsapp_messages (
      conversation_id,
      tenant_id,
      role,
      content,
      type,
      is_from_me,
      created_at
    ) VALUES (
      v_conv.id,
      v_conv.tenant_id,
      'system',
      'Atendimento encerrado automaticamente por inatividade (12h sem interação).',
      'text',
      true,
      NOW()
    );

    -- 2. Atualiza a conversa para RESOLVED, desassocia o atendente e reinicia o contexto ativo
    UPDATE public.whatsapp_conversations
    SET
      state = 'RESOLVED',
      assigned_agent_id = NULL,
      history = '[]'::jsonb
    WHERE id = v_conv.id;

    v_closed_count := v_closed_count + 1;
  END LOOP;

  RETURN v_closed_count;
END;
$$;

-- Permissões de execução
GRANT EXECUTE ON FUNCTION public.close_inactive_whatsapp_conversations() TO authenticated, service_role;

-- Agendamento no pg_cron (a cada 15 minutos, para checagem contínua em segundo plano)
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('close-inactive-whatsapp-conversations');
EXCEPTION WHEN OTHERS THEN
  -- Ignora se não existia previamente
END $$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'close-inactive-whatsapp-conversations',
    '*/15 * * * *',
    'SELECT public.close_inactive_whatsapp_conversations();'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron não pôde ser agendado automaticamente (ambiente sem suporte a cron). A verificação JIT nas Edge Functions garantirá o encerramento após 12h.';
END $$;
