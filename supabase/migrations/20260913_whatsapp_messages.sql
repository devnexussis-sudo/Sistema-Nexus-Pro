-- ═══════════════════════════════════════════════════════════════════
-- WhatsApp Messages — Migration for Dedicated Table Storage
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'bot', 'agent', 'system')),
  content TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  media_url TEXT,
  is_from_me BOOLEAN NOT NULL DEFAULT false,
  agent_id UUID REFERENCES users(id) ON DELETE SET NULL,
  agent_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices para performance máxima na paginação infinita
CREATE INDEX IF NOT EXISTS idx_wpp_msg_conv_created ON whatsapp_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wpp_msg_tenant ON whatsapp_messages(tenant_id);

-- RLS Segurança Absoluta (Multiempresa)
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wpp_msg_tenant_select" ON whatsapp_messages
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid() LIMIT 1)
  );

CREATE POLICY "wpp_msg_tenant_insert" ON whatsapp_messages
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid() LIMIT 1)
  );

CREATE POLICY "wpp_msg_tenant_update" ON whatsapp_messages
  FOR UPDATE USING (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid() LIMIT 1)
  );

CREATE POLICY "wpp_msg_tenant_delete" ON whatsapp_messages
  FOR DELETE USING (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid() LIMIT 1)
  );

-- Supabase Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_messages;

-- ═══════════════════════════════════════════════════════════════════
-- Script de Migração de Dados (JSON History -> whatsapp_messages)
-- Transfere todo o histórico antigo automaticamente sem perder dados
-- ═══════════════════════════════════════════════════════════════════
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
    FOR conv IN SELECT id, tenant_id, history FROM whatsapp_conversations WHERE jsonb_typeof(history) = 'array' AND jsonb_array_length(history) > 0 LOOP
        FOR msg IN SELECT * FROM jsonb_array_elements(conv.history) LOOP
            v_role := msg->>'role';
            v_content := msg->>'content';
            
            IF msg->>'timestamp' IS NOT NULL THEN
                v_timestamp := (msg->>'timestamp')::timestamptz;
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
            
            -- Detecta tipo a partir de links internos que estávamos usando
            v_type := 'text';
            IF v_content LIKE 'MEDIA_URL:%' THEN
                v_type := split_part(v_content, ':', 2);
            END IF;

            INSERT INTO whatsapp_messages (conversation_id, tenant_id, role, content, type, is_from_me, agent_id, agent_name, created_at)
            VALUES (conv.id, conv.tenant_id, v_role, v_content, v_type, v_is_from_me, v_agent_id, v_agent_name, v_timestamp);
        END LOOP;
        
        -- Limpa a coluna history para desafogar o Realtime da tabela de conversas
        UPDATE whatsapp_conversations SET history = '[]'::jsonb WHERE id = conv.id;
    END LOOP;
END $$;
