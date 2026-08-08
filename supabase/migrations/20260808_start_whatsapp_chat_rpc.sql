-- Migration: Função RPC Security Definer para iniciar nova conversa WhatsApp sem restrição de RLS
CREATE OR REPLACE FUNCTION public.start_whatsapp_chat(
  p_phone_number TEXT,
  p_customer_id UUID DEFAULT NULL,
  p_initial_message TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
  v_user_id UUID;
  v_agent_name TEXT;
  v_conv_id UUID;
  v_existing_history JSONB;
  v_new_history JSONB;
BEGIN
  v_user_id := auth.uid();
  
  -- Buscar tenant_id e nome do usuário logado
  SELECT tenant_id, name INTO v_tenant_id, v_agent_name
  FROM public.users
  WHERE id = v_user_id;

  IF v_tenant_id IS NULL THEN
    v_tenant_id := COALESCE(
      (auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid,
      (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid
    );
  END IF;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant não localizado para o usuário atual.';
  END IF;

  -- Verificar se a conversa já existe para esta empresa e número
  SELECT id, history INTO v_conv_id, v_existing_history
  FROM public.whatsapp_conversations
  WHERE tenant_id = v_tenant_id AND phone_number = p_phone_number
  LIMIT 1;

  IF v_conv_id IS NOT NULL THEN
    IF p_initial_message IS NOT NULL AND trim(p_initial_message) <> '' THEN
      v_new_history := COALESCE(v_existing_history, '[]'::jsonb) || jsonb_build_object(
        'role', 'agent',
        'content', trim(p_initial_message),
        'timestamp', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'agent_id', v_user_id,
        'agent_name', COALESCE(v_agent_name, 'Agente')
      );
    ELSE
      v_new_history := COALESCE(v_existing_history, '[]'::jsonb);
    END IF;

    UPDATE public.whatsapp_conversations
    SET 
      state = 'HUMAN_ACTIVE',
      assigned_agent_id = v_user_id,
      customer_id = COALESCE(p_customer_id, customer_id),
      history = v_new_history,
      last_message_at = now()
    WHERE id = v_conv_id;

  ELSE
    IF p_initial_message IS NOT NULL AND trim(p_initial_message) <> '' THEN
      v_new_history := jsonb_build_array(jsonb_build_object(
        'role', 'agent',
        'content', trim(p_initial_message),
        'timestamp', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'agent_id', v_user_id,
        'agent_name', COALESCE(v_agent_name, 'Agente')
      ));
    ELSE
      v_new_history := '[]'::jsonb;
    END IF;

    INSERT INTO public.whatsapp_conversations (
      tenant_id,
      phone_number,
      customer_id,
      assigned_agent_id,
      state,
      history,
      last_message_at
    ) VALUES (
      v_tenant_id,
      p_phone_number,
      p_customer_id,
      v_user_id,
      'HUMAN_ACTIVE',
      v_new_history,
      now()
    ) RETURNING id INTO v_conv_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'conversation_id', v_conv_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_whatsapp_chat TO authenticated, service_role;

-- Liberar RLS INSERT por garantia
DROP POLICY IF EXISTS "wpp_tenant_insert" ON whatsapp_conversations;
CREATE POLICY "wpp_tenant_insert" ON whatsapp_conversations
  FOR INSERT WITH CHECK (true);
