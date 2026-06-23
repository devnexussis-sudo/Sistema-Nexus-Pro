BEGIN;

DROP POLICY IF EXISTS "wpp_tenant_select" ON whatsapp_conversations;
DROP POLICY IF EXISTS "wpp_tenant_update" ON whatsapp_conversations;

CREATE POLICY "wpp_tenant_select" ON whatsapp_conversations
  FOR SELECT USING (tenant_id = public.get_auth_tenant_id());

CREATE POLICY "wpp_tenant_update" ON whatsapp_conversations
  FOR UPDATE USING (tenant_id = public.get_auth_tenant_id());

COMMIT;
