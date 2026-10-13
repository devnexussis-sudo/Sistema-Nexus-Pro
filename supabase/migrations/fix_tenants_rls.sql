-- 🛡️ Nexus Pro - Tenants RLS Fix
-- Goal: Allow authenticated users to read and update their own tenant data.

BEGIN;

-- Ensure get_auth_tenant_id exists (it should from 20260301_write_policies.sql)
-- But we'll redefine it here just in case to be safe and independent.
CREATE OR REPLACE FUNCTION public.get_auth_tenant_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'tenantId', '')::uuid,
    NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'tenant_id', '')::uuid,
    (SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1)
  );
$$;

DROP POLICY IF EXISTS "tenants_read_isolation" ON public.tenants;
CREATE POLICY "tenants_read_isolation" ON public.tenants
  FOR SELECT TO authenticated
  USING (id = get_auth_tenant_id());

DROP POLICY IF EXISTS "tenants_update_admin" ON public.tenants;
CREATE POLICY "tenants_update_admin" ON public.tenants
  FOR UPDATE TO authenticated
  USING (id = get_auth_tenant_id())
  WITH CHECK (id = get_auth_tenant_id());

-- Grant usage to authenticated users if needed
GRANT SELECT, UPDATE ON public.tenants TO authenticated;

COMMIT;
