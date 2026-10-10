-- ============================================================================
-- NEXUS PRO — CORREÇÃO DEFINITIVA DE RLS & ESTANCAMENTO DE EGRESS POSTGREST
-- Arquivo: supabase/migrations/20261010_fix_whatsapp_messages_rls_and_egress.sql
-- ============================================================================

BEGIN;

-- 1. Assegurar que a tabela whatsapp_messages possui RLS ativado
ALTER TABLE IF EXISTS public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- 2. Limpar políticas antigas com subqueries recursivas na tabela users
DROP POLICY IF EXISTS "wpp_msg_tenant_select" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "wpp_msg_tenant_insert" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "wpp_msg_tenant_update" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "wpp_msg_tenant_delete" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "whatsapp_messages_tenant_select" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "whatsapp_messages_tenant_insert" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "whatsapp_messages_tenant_update" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "whatsapp_messages_tenant_delete" ON public.whatsapp_messages;

-- 3. Criar políticas limpas usando SECURITY DEFINER get_auth_tenant_id()
CREATE POLICY "wpp_msg_tenant_select" ON public.whatsapp_messages
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_auth_tenant_id()
    AND public.get_auth_tenant_id() IS NOT NULL
  );

CREATE POLICY "wpp_msg_tenant_insert" ON public.whatsapp_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_auth_tenant_id()
    AND public.get_auth_tenant_id() IS NOT NULL
  );

CREATE POLICY "wpp_msg_tenant_update" ON public.whatsapp_messages
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_auth_tenant_id()
    AND public.get_auth_tenant_id() IS NOT NULL
  );

CREATE POLICY "wpp_msg_tenant_delete" ON public.whatsapp_messages
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_auth_tenant_id()
    AND public.get_auth_tenant_id() IS NOT NULL
  );

-- 4. Garantir permissões de acesso
GRANT ALL ON TABLE public.whatsapp_messages TO authenticated, service_role;
GRANT SELECT ON TABLE public.whatsapp_messages TO anon;

-- 5. Backfill seguro de mensagens do JSON history para a tabela dedicada se não estiverem presentes
DO $$
DECLARE
    conv record;
    msg jsonb;
    v_role text;
    v_content text;
    v_timestamp timestamptz;
    v_agent_id uuid;
    v_agent_name text;
    v_type text;
    v_is_from_me boolean;
BEGIN
    FOR conv IN 
      SELECT id, tenant_id, history 
      FROM public.whatsapp_conversations 
      WHERE jsonb_typeof(history) = 'array' AND jsonb_array_length(history) > 0
    LOOP
      -- Apenas insere se a conversa ainda não tem mensagens na tabela dedicada
      IF NOT EXISTS (SELECT 1 FROM public.whatsapp_messages WHERE conversation_id = conv.id LIMIT 1) THEN
        FOR msg IN SELECT * FROM jsonb_array_elements(conv.history) LOOP
            v_role := COALESCE(msg->>'role', 'user');
            v_content := COALESCE(msg->>'content', '');
            
            BEGIN
                v_timestamp := (msg->>'timestamp')::timestamptz;
            EXCEPTION WHEN OTHERS THEN
                v_timestamp := now();
            END;

            v_agent_name := msg->>'agent_name';
            v_type := COALESCE(msg->>'type', 'text');
            v_is_from_me := (v_role = 'bot' OR v_role = 'agent');

            IF msg->>'agent_id' IS NOT NULL AND msg->>'agent_id' ~ '^[0-9a-fA-F-]{36}$' THEN
                v_agent_id := (msg->>'agent_id')::uuid;
            ELSE
                v_agent_id := NULL;
            END IF;

            IF v_content <> '' OR msg->>'media_url' IS NOT NULL THEN
                INSERT INTO public.whatsapp_messages (
                    conversation_id,
                    tenant_id,
                    role,
                    content,
                    type,
                    media_url,
                    is_from_me,
                    agent_id,
                    agent_name,
                    created_at
                ) VALUES (
                    conv.id,
                    conv.tenant_id,
                    v_role,
                    v_content,
                    v_type,
                    msg->>'media_url',
                    v_is_from_me,
                    v_agent_id,
                    v_agent_name,
                    COALESCE(v_timestamp, now())
                );
            END IF;
        END LOOP;
      END IF;
    END LOOP;
END $$;

-- 6. Recarregar o cache do PostgREST imediatamente
NOTIFY pgrst, 'reload schema';

COMMIT;
