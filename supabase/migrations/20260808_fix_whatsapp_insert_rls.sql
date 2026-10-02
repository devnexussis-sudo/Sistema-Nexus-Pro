-- Migration: Adicionar política de INSERT na tabela whatsapp_conversations para RLS
DROP POLICY IF EXISTS "wpp_tenant_insert" ON whatsapp_conversations;

CREATE POLICY "wpp_tenant_insert" ON whatsapp_conversations
  FOR INSERT WITH CHECK (
    tenant_id = COALESCE(
      (auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid,
      (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    )
    OR tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );
