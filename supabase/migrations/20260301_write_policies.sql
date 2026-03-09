-- 🛡️ Nexus Pro - Enterprise Security Repair (V7.1)
-- Objective: Fix write access and establish zero-trust tenant isolation.
-- This version fixes the ENUM casting error for the 'role' column.

BEGIN;

-- 1. Helper Functions (Idempotent)
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

CREATE OR REPLACE FUNCTION public.has_permission(required_role text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND (UPPER(role::text) = UPPER(required_role))
  );
$$;

-- 2. Cleanup and Policy Establishment

-- Table: orders
DROP POLICY IF EXISTS "orders_write_tenant" ON public.orders;
DROP POLICY IF EXISTS "orders_all_policy" ON public.orders;
DROP POLICY IF EXISTS "orders_all_access_tenant" ON public.orders;
CREATE POLICY "orders_all_access_tenant" ON public.orders
FOR ALL TO authenticated
USING (tenant_id = get_auth_tenant_id())
WITH CHECK (tenant_id = get_auth_tenant_id());

-- Table: users
DROP POLICY IF EXISTS "users_write_tenant" ON public.users;
DROP POLICY IF EXISTS "users_isolation_select" ON public.users;
DROP POLICY IF EXISTS "users_isolation_update" ON public.users;
DROP POLICY IF EXISTS "users_isolation_insert" ON public.users;
DROP POLICY IF EXISTS "users_all_access_tenant" ON public.users;
CREATE POLICY "users_all_access_tenant" ON public.users
FOR ALL TO authenticated
USING (id = auth.uid() OR tenant_id = get_auth_tenant_id())
WITH CHECK (id = auth.uid() OR (tenant_id = get_auth_tenant_id() AND has_permission('ADMIN')));

-- Table: technicians
DROP POLICY IF EXISTS "technicians_write_tenant" ON public.technicians;
DROP POLICY IF EXISTS "technicians_all_policy" ON public.technicians;
DROP POLICY IF EXISTS "technicians_all_access_tenant" ON public.technicians;
CREATE POLICY "technicians_all_access_tenant" ON public.technicians
FOR ALL TO authenticated
USING (tenant_id = get_auth_tenant_id())
WITH CHECK (tenant_id = get_auth_tenant_id());

-- Table: user_groups
DROP POLICY IF EXISTS "user_groups_write_tenant" ON public.user_groups;
DROP POLICY IF EXISTS "user_groups_all_access_tenant" ON public.user_groups;
CREATE POLICY "user_groups_all_access_tenant" ON public.user_groups
FOR ALL TO authenticated
USING (tenant_id = get_auth_tenant_id())
WITH CHECK (tenant_id = get_auth_tenant_id());

COMMIT;
