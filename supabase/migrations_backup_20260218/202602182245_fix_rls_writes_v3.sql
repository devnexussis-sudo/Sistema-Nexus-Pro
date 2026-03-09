/*
  🛡️ NEXUS PRO - REPAIR MIGRATION for WRITE ACCESS
  TIMESTAMP: 202602182245_fix_rls_writes_v3.sql
  
  OBJECTIVE: 
  - Establish strict Tenant Isolation using Database-Level Validation (Single Source of Truth).
  - Fix "permission denied" on INSERT/UPDATE by enforcing tenant_id matching.
  - Eliminate recursion risks using SECURITY DEFINER functions.
*/

BEGIN;

-- 1. Helper Function: Get Current User's Tenant ID (SECURITY DEFINER to bypass RLS recursion)
CREATE OR REPLACE FUNCTION public.get_auth_tenant_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;

-- 2. Helper Function: Check User Permission (Optional but good for granularity)
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
    AND role = required_role
  );
$$;

-- ==================================================================================
-- TABLE: ORDERS (Critical Path)
-- ==================================================================================
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_select_policy" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_policy" ON public.orders;
DROP POLICY IF EXISTS "orders_update_policy" ON public.orders;
DROP POLICY IF EXISTS "orders_delete_policy" ON public.orders;
DROP POLICY IF EXISTS "view_orders" ON public.orders;
DROP POLICY IF EXISTS "write_orders" ON public.orders;
DROP POLICY IF EXISTS "modify_orders" ON public.orders;
DROP POLICY IF EXISTS "delete_orders" ON public.orders;

-- SELECT: Can see orders from own tenant
CREATE POLICY "orders_select_policy" ON public.orders
FOR SELECT USING (
  tenant_id = get_auth_tenant_id()
);

-- INSERT: Can insert only into own tenant
CREATE POLICY "orders_insert_policy" ON public.orders
FOR INSERT WITH CHECK (
  tenant_id = get_auth_tenant_id()
);

-- UPDATE: Can update orders in own tenant
CREATE POLICY "orders_update_policy" ON public.orders
FOR UPDATE USING (
  tenant_id = get_auth_tenant_id()
) WITH CHECK (
  tenant_id = get_auth_tenant_id()
);

-- DELETE: Only admins can delete
CREATE POLICY "orders_delete_policy" ON public.orders
FOR DELETE USING (
  tenant_id = get_auth_tenant_id()
  AND has_permission('ADMIN')
);


-- ==================================================================================
-- TABLE: CUSTOMERS
-- ==================================================================================
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_isolation_select" ON public.customers;
DROP POLICY IF EXISTS "customers_isolation_insert" ON public.customers;
DROP POLICY IF EXISTS "customers_isolation_update" ON public.customers;
DROP POLICY IF EXISTS "customers_isolation_delete" ON public.customers;
DROP POLICY IF EXISTS "view_customers" ON public.customers;
DROP POLICY IF EXISTS "write_customers" ON public.customers;
DROP POLICY IF EXISTS "modify_customers" ON public.customers;
DROP POLICY IF EXISTS "delete_customers" ON public.customers;

CREATE POLICY "customers_isolation_select" ON public.customers FOR SELECT USING (tenant_id = get_auth_tenant_id());
CREATE POLICY "customers_isolation_insert" ON public.customers FOR INSERT WITH CHECK (tenant_id = get_auth_tenant_id());
CREATE POLICY "customers_isolation_update" ON public.customers FOR UPDATE USING (tenant_id = get_auth_tenant_id()) WITH CHECK (tenant_id = get_auth_tenant_id());
CREATE POLICY "customers_isolation_delete" ON public.customers FOR DELETE USING (tenant_id = get_auth_tenant_id() AND has_permission('ADMIN'));


-- ==================================================================================
-- TABLE: USERS (The tricky one)
-- ==================================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_isolation_select" ON public.users;
DROP POLICY IF EXISTS "users_isolation_update" ON public.users;
DROP POLICY IF EXISTS "view_users" ON public.users; -- clear old ones

-- SELECT: Users can see themselves AND other users in the same tenant
-- We rely on get_auth_tenant_id() which is SECURITY DEFINER, so it won't trigger infinite recursion here.
CREATE POLICY "users_isolation_select" ON public.users
FOR SELECT USING (
  id = auth.uid() OR tenant_id = get_auth_tenant_id()
);

-- UPDATE: Users can update their own profile (avatar, name) OR Admins can update others in same tenant
CREATE POLICY "users_isolation_update" ON public.users
FOR UPDATE USING (
  id = auth.uid() OR (tenant_id = get_auth_tenant_id() AND has_permission('ADMIN'))
) WITH CHECK (
  id = auth.uid() OR (tenant_id = get_auth_tenant_id() AND has_permission('ADMIN'))
);

-- INSERT: Usually handled by Auth Hooks/Triggers, but if allowed manually:
-- Only ADMIN can create users (or system level) - typically Supabase Auth handles insertion into auth.users, 
-- and a trigger populates public.users. We'll allow INSERT if tenant matches (for invites).
CREATE POLICY "users_isolation_insert" ON public.users
FOR INSERT WITH CHECK (
  tenant_id = get_auth_tenant_id() AND has_permission('ADMIN')
);


-- ==================================================================================
-- TABLE: ACTIVATION_RULES & FORM_TEMPLATES (Settings)
-- ==================================================================================
-- Only ADMIN/MANAGER should mess with these, but read is open to Tenant

ALTER TABLE public.activation_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rules_isolation_all" ON public.activation_rules;
DROP POLICY IF EXISTS "view_rules" ON public.activation_rules;
DROP POLICY IF EXISTS "manage_rules" ON public.activation_rules;

CREATE POLICY "rules_select" ON public.activation_rules FOR SELECT USING (tenant_id = get_auth_tenant_id());
CREATE POLICY "rules_write" ON public.activation_rules FOR INSERT WITH CHECK (tenant_id = get_auth_tenant_id() AND has_permission('ADMIN'));
CREATE POLICY "rules_modify" ON public.activation_rules FOR UPDATE USING (tenant_id = get_auth_tenant_id() AND has_permission('ADMIN'));
CREATE POLICY "rules_delete" ON public.activation_rules FOR DELETE USING (tenant_id = get_auth_tenant_id() AND has_permission('ADMIN'));

ALTER TABLE public.form_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "templates_isolation_select" ON public.form_templates;
-- ... clear others if needed
CREATE POLICY "templates_select" ON public.form_templates FOR SELECT USING (tenant_id = get_auth_tenant_id());
CREATE POLICY "templates_write" ON public.form_templates FOR INSERT WITH CHECK (tenant_id = get_auth_tenant_id() AND has_permission('ADMIN'));
CREATE POLICY "templates_modify" ON public.form_templates FOR UPDATE USING (tenant_id = get_auth_tenant_id() AND has_permission('ADMIN'));
CREATE POLICY "templates_delete" ON public.form_templates FOR DELETE USING (tenant_id = get_auth_tenant_id() AND has_permission('ADMIN'));

COMMIT;
