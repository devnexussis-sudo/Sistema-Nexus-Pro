-- ═══════════════════════════════════════════════════════════════════
-- WhatsApp Concurrent Batch Append RPC — Prevent Race Conditions
-- Permite receber múltiplos webhooks de mídia/fotos simultâneos sem perder imagens
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION append_whatsapp_message(
  p_conversation_id UUID,
  p_tenant_id UUID,
  p_messages JSONB,
  p_new_state TEXT DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_msg JSONB;
  v_role TEXT;
  v_content TEXT;
  v_type TEXT;
  v_is_from_me BOOLEAN;
  v_agent_id UUID;
  v_agent_name TEXT;
  v_timestamp TIMESTAMPTZ;
  v_existing_history JSONB;
  v_merged_history JSONB;
BEGIN
  -- 1. Inserir cada mensagem na tabela dedicada whatsapp_messages
  FOR v_msg IN SELECT * FROM jsonb_array_elements(p_messages) LOOP
    v_role := v_msg->>'role';
    v_content := COALESCE(v_msg->>'content', '');
    v_type := COALESCE(v_msg->>'type', 'text');
    
    IF v_content LIKE 'MEDIA_URL:%' THEN
      v_type := split_part(v_content, ':', 2);
    END IF;
    
    IF v_msg->>'is_from_me' IS NOT NULL THEN
      v_is_from_me := (v_msg->>'is_from_me')::boolean;
    ELSE
      v_is_from_me := (v_role = 'agent' OR v_role = 'bot' OR v_role = 'system');
    END IF;

    v_agent_id := NULL;
    IF v_msg->>'agent_id' IS NOT NULL THEN
      BEGIN
        v_agent_id := (v_msg->>'agent_id')::uuid;
      EXCEPTION WHEN OTHERS THEN
        v_agent_id := NULL;
      END;
    END IF;
    v_agent_name := v_msg->>'agent_name';

    IF v_msg->>'timestamp' IS NOT NULL THEN
      v_timestamp := (v_msg->>'timestamp')::timestamptz;
    ELSE
      v_timestamp := NOW();
    END IF;

    INSERT INTO whatsapp_messages (
      conversation_id, tenant_id, role, content, type, is_from_me, agent_id, agent_name, created_at
    ) VALUES (
      p_conversation_id, p_tenant_id, v_role, v_content, v_type, v_is_from_me, v_agent_id, v_agent_name, v_timestamp
    );
  END LOOP;

  -- 2. Atualizar whatsapp_conversations com ROW LOCK atômico para impedir Race Condition
  SELECT COALESCE(history, '[]'::jsonb) INTO v_existing_history
  FROM whatsapp_conversations
  WHERE id = p_conversation_id
  FOR UPDATE;

  -- Concatenar histórico preservando mensagens anteriores
  v_merged_history := v_existing_history || p_messages;

  -- Manter no máximo as últimas 100 mensagens para leveza da coluna JSONB
  IF jsonb_array_length(v_merged_history) > 100 THEN
    SELECT jsonb_agg(elem) INTO v_merged_history
    FROM (
      SELECT elem
      FROM jsonb_array_elements(v_merged_history)
      OFFSET (jsonb_array_length(v_merged_history) - 100)
    ) sub;
  END IF;

  UPDATE whatsapp_conversations
  SET
    history = COALESCE(v_merged_history, '[]'::jsonb),
    state = COALESCE(p_new_state, state),
    customer_id = COALESCE(p_customer_id, customer_id),
    last_message_at = NOW()
  WHERE id = p_conversation_id;
END;
$$;
