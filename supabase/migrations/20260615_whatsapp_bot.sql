-- ═══════════════════════════════════════════════════════════════════
-- WhatsApp Bot — Database Migration
-- ═══════════════════════════════════════════════════════════════════

-- 1. Coluna de configurações WhatsApp em tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_settings JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN tenants.whatsapp_settings IS 
'WhatsApp Bot config: { evolution_api_url, evolution_api_key, instance_name,
bot_enabled, bot_name, greeting_message, human_keyword, phone_number_display }';

-- 2. Tabela de conversas (sessões por número de telefone + tenant)
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone_number     TEXT NOT NULL,           -- E.164 sem + (ex: 5535999998888)
  customer_id      UUID REFERENCES customers(id) ON DELETE SET NULL,
  state            TEXT NOT NULL DEFAULT 'GREETING',
  -- GREETING | IDENTIFYING | CUSTOMER_FOUND | VIEWING_ORDERS
  -- CREATING_ORDER | ORDER_DETAILS | WAITING_HUMAN | HUMAN_ACTIVE | RESOLVED
  history          JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- [{role: "bot"|"user"|"agent", content: string, timestamp: ISO8601}]
  assigned_agent_id UUID REFERENCES users(id) ON DELETE SET NULL,
  last_message_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT unique_phone_tenant UNIQUE (phone_number, tenant_id)
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_wpp_phone_tenant 
  ON whatsapp_conversations(phone_number, tenant_id);

CREATE INDEX IF NOT EXISTS idx_wpp_state_active 
  ON whatsapp_conversations(state, tenant_id) 
  WHERE state IN ('WAITING_HUMAN', 'HUMAN_ACTIVE');

CREATE INDEX IF NOT EXISTS idx_wpp_last_message 
  ON whatsapp_conversations(last_message_at DESC, tenant_id);

-- 3. RLS
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;

-- Admins do tenant podem ver todas as conversas do seu tenant
CREATE POLICY "wpp_tenant_select" ON whatsapp_conversations
  FOR SELECT USING (
    tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "wpp_tenant_update" ON whatsapp_conversations
  FOR UPDATE USING (
    tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() LIMIT 1
    )
  );

-- Edge Functions usam service_role (bypass RLS) — OK

-- 4. Realtime para o inbox
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_conversations;
