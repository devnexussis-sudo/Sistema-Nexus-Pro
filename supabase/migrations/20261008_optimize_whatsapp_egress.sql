-- ============================================================================
-- NEXUS PRO — OTIMIZAÇÃO DE EGRESS DO WHATSAPP & ESTRUTURA DEDICADA DE MENSAGENS
-- Arquivo: supabase/migrations/20261008_optimize_whatsapp_egress.sql
-- ============================================================================
-- 1. Cria com idempotência a tabela dedicada `public.whatsapp_messages`
-- 2. Adiciona índices de alto desempenho para paginação por conversa
-- 3. Configura RLS multi-tenant absoluto e permissões do PostgREST (corrige o 404)
-- 4. Adiciona colunas leves de prévia na tabela `whatsapp_conversations` (elimina a leitura de `history` na listagem)
-- 5. Faz backfill seguro dos dados antigos do JSON `history` para a nova tabela
-- 6. Recarrega o cache do PostgREST
-- ============================================================================

-- 1. TABELA DEDICADA DE MENSAGENS
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'bot', 'agent', 'system')),
  content TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  media_url TEXT,
  is_from_me BOOLEAN NOT NULL DEFAULT false,
  agent_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  agent_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. ÍNDICES DE ALTA PERFORMANCE (PAGINAÇÃO INVERSA RÁPIDA)
CREATE INDEX IF NOT EXISTS idx_wpp_msg_conv_created ON public.whatsapp_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wpp_msg_tenant ON public.whatsapp_messages(tenant_id);

-- 3. RLS MULTI-TENANT E SEGURANÇA
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wpp_msg_tenant_select" ON public.whatsapp_messages;
CREATE POLICY "wpp_msg_tenant_select" ON public.whatsapp_messages
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1)
  );

DROP POLICY IF EXISTS "wpp_msg_tenant_insert" ON public.whatsapp_messages;
CREATE POLICY "wpp_msg_tenant_insert" ON public.whatsapp_messages
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1)
  );

DROP POLICY IF EXISTS "wpp_msg_tenant_update" ON public.whatsapp_messages;
CREATE POLICY "wpp_msg_tenant_update" ON public.whatsapp_messages
  FOR UPDATE USING (
    tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1)
  );

DROP POLICY IF EXISTS "wpp_msg_tenant_delete" ON public.whatsapp_messages;
CREATE POLICY "wpp_msg_tenant_delete" ON public.whatsapp_messages
  FOR DELETE USING (
    tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1)
  );

-- Conceder permissões para authenticated e service_role
GRANT ALL ON TABLE public.whatsapp_messages TO authenticated, service_role;
GRANT SELECT ON TABLE public.whatsapp_messages TO anon;

-- 4. ADICIONAR AO REALTIME SUPABASE
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- 5. ADICIONAR COLUNAS LEVES DE PRÉVIA EM `whatsapp_conversations` (ZERO HISTORY NO FEED)
ALTER TABLE public.whatsapp_conversations ADD COLUMN IF NOT EXISTS last_message_preview TEXT;
ALTER TABLE public.whatsapp_conversations ADD COLUMN IF NOT EXISTS last_message_role TEXT;

-- 6. BACKFILL DO PREVIEW NA TABELA DE CONVERSAS
UPDATE public.whatsapp_conversations
SET 
  last_message_preview = COALESCE(history->-1->>'content', ''),
  last_message_role = COALESCE(history->-1->>'role', '')
WHERE (last_message_preview IS NULL OR last_message_preview = '')
  AND jsonb_typeof(history) = 'array' 
  AND jsonb_array_length(history) > 0;

-- 7. BACKFILL DE HISTÓRICO ANTIGO PARA `whatsapp_messages` (SE A TABELA ESTIVER VAZIA)
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
    IF NOT EXISTS (SELECT 1 FROM public.whatsapp_messages LIMIT 1) THEN
        FOR conv IN SELECT id, tenant_id, history FROM public.whatsapp_conversations WHERE jsonb_typeof(history) = 'array' AND jsonb_array_length(history) > 0 LOOP
            FOR msg IN SELECT * FROM jsonb_array_elements(conv.history) LOOP
                v_role := COALESCE(msg->>'role', 'user');
                v_content := COALESCE(msg->>'content', '');
                
                IF msg->>'timestamp' IS NOT NULL THEN
                    BEGIN
                        v_timestamp := (msg->>'timestamp')::timestamptz;
                    EXCEPTION WHEN OTHERS THEN
                        v_timestamp := now();
                    END;
                ELSE
                    v_timestamp := now();
                END IF;

                v_agent_id := NULL;
                IF msg->>'agent_id' IS NOT NULL THEN
                    BEGIN
                        v_agent_id := (msg->>'agent_id')::uuid;
                    EXCEPTION WHEN OTHERS THEN
                        v_agent_id := NULL;
                    END;
                END IF;

                v_agent_name := msg->>'agent_name';
                v_is_from_me := (v_role = 'agent' OR v_role = 'bot' OR v_role = 'system');
                
                v_type := 'text';
                IF v_content LIKE 'MEDIA_URL:%' THEN
                    v_type := split_part(v_content, ':', 2);
                END IF;

                INSERT INTO public.whatsapp_messages (conversation_id, tenant_id, role, content, type, is_from_me, agent_id, agent_name, created_at)
                VALUES (conv.id, conv.tenant_id, v_role, v_content, v_type, v_is_from_me, v_agent_id, v_agent_name, v_timestamp);
            END LOOP;
        END LOOP;
    END IF;
END $$;

-- 8. RECARREGAR O SCHEMA CACHE DO POSTGREST (ELIMINA ERRO 404 IMEDIATAMENTE)
NOTIFY pgrst, 'reload schema';
