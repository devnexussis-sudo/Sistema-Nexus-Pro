-- ------------------------------------------------------------
-- 20260702_create_get_auth_tenant_id.sql
-- ------------------------------------------------------------
-- Função utilitária para extrair o tenant_id armazenado nas claims do JWT.
-- Supabase não possui uma função nativa; usamos app_metadata (mais seguro).

CREATE OR REPLACE FUNCTION public.get_auth_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
$$;

-- Caso o tenant_id tenha sido armazenado em user_metadata (fallback)
CREATE OR REPLACE FUNCTION public.get_auth_tenant_id_fallback()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid,
    (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid
  );
$$;

-- (Opcional) Atualiza políticas existentes para usar a função fallback se preferir.
-- ALTER POLICY "ai_kb_all_access" ON public.ai_knowledge_base
--   USING (tenant_id = public.get_auth_tenant_id_fallback())
--   WITH CHECK (tenant_id = public.get_auth_tenant_id_fallback());

-- Confirmação
SELECT proname, pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'get_auth_tenant_id';
