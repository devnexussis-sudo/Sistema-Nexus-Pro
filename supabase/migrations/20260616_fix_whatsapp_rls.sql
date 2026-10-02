DROP POLICY IF EXISTS "wpp_tenant_select" ON whatsapp_conversations;
CREATE POLICY "wpp_tenant_select" ON whatsapp_conversations
  FOR SELECT USING (
    tenant_id = COALESCE(
      (auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid,
      (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    )
  );
