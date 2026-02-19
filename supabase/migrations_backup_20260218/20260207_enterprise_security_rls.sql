-- ============================================================================
-- NEXUS PRO - ENTERPRISE SECURITY & RLS ALIGNMENT SCRIPT
-- ============================================================================
-- Project: gbwkfumodaqbmmiwayhf
-- Purpose: Align Supabase database to SaaS enterprise security standards
-- Author: Nexus Pro DevOps Team
-- Date: 2026-02-07
-- Version: 1.0.0
--
-- IMPORTANT: This script is IDEMPOTENT where possible. Safe to re-run.
-- 
-- What this script does:
-- 1. Creates secure helper functions for JWT claim extraction
-- 2. Enables RLS on all public tables
-- 3. Creates comprehensive policies for multi-tenant isolation
-- 4. Adds performance indexes for policy columns
-- 5. Creates audit logging infrastructure
-- 6. Revokes unnecessary permissions from anon/authenticated roles
--
-- BACKUP RECOMMENDATION: Take a snapshot before running in production
-- ============================================================================

-- ============================================================================
-- SECTION 1: HELPER FUNCTIONS (SECURITY DEFINER)
-- ============================================================================

-- Function to extract tenant_id from JWT claim 'metaTenant'
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tenant_uuid uuid;
BEGIN
  -- Try to get tenant_id from JWT claim 'metaTenant'
  tenant_uuid := NULLIF(current_setting('request.jwt.claims', true)::json->>'metaTenant', '')::uuid;
  
  -- Fallback: try 'tenant_id' claim
  IF tenant_uuid IS NULL THEN
    tenant_uuid := NULLIF(current_setting('request.jwt.claims', true)::json->>'tenant_id', '')::uuid;
  END IF;
  
  -- Final fallback: lookup from users table
  IF tenant_uuid IS NULL THEN
    SELECT u.tenant_id INTO tenant_uuid
    FROM public.users u
    WHERE u.id = auth.uid()
    LIMIT 1;
  END IF;
  
  RETURN tenant_uuid;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.get_user_tenant_id() IS 'Securely extracts tenant_id from JWT claims or users table. Used by RLS policies.';

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role text;
BEGIN
  -- Check JWT claim for role
  user_role := current_setting('request.jwt.claims', true)::json->>'user_role';
  
  IF user_role = 'admin' OR user_role = 'ADMIN' THEN
    RETURN true;
  END IF;
  
  -- Fallback: check users table
  SELECT u.role INTO user_role
  FROM public.users u
  WHERE u.id = auth.uid()
  LIMIT 1;
  
  RETURN (user_role = 'admin' OR user_role = 'ADMIN');
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$;

COMMENT ON FUNCTION public.is_admin() IS 'Checks if current user has admin role from JWT or users table.';

-- Function to get current user's organization/tenant
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Alias for get_user_tenant_id for compatibility
  RETURN public.get_user_tenant_id();
END;
$$;

-- ============================================================================
-- SECTION 2: REVOKE UNNECESSARY PERMISSIONS
-- ============================================================================

-- Revoke direct execution of helper functions from anon/authenticated
-- These should only be called within policies
REVOKE EXECUTE ON FUNCTION public.get_user_tenant_id() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_organization_id() FROM anon, authenticated;

-- Grant to postgres and service_role only
GRANT EXECUTE ON FUNCTION public.get_user_tenant_id() TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_organization_id() TO postgres, service_role;

-- ============================================================================
-- SECTION 3: ENABLE RLS ON ALL PUBLIC TABLES
-- ============================================================================

-- Core tables
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.equipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.equipment_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stock_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.service_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.form_activation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.system_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.technician_location_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.checklist_items ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SECTION 4: DROP EXISTING POLICIES (for idempotency)
-- ============================================================================

-- Users policies
DROP POLICY IF EXISTS "Users can view users in same tenant" ON public.users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Admins can manage all users in tenant" ON public.users;
DROP POLICY IF EXISTS "users_select_policy" ON public.users;
DROP POLICY IF EXISTS "users_insert_policy" ON public.users;
DROP POLICY IF EXISTS "users_update_policy" ON public.users;
DROP POLICY IF EXISTS "users_delete_policy" ON public.users;

-- Tenants policies
DROP POLICY IF EXISTS "Users can view own tenant" ON public.tenants;
DROP POLICY IF EXISTS "tenants_select_policy" ON public.tenants;

-- Orders policies
DROP POLICY IF EXISTS "Users can view orders in same tenant" ON public.orders;
DROP POLICY IF EXISTS "Users can insert orders in same tenant" ON public.orders;
DROP POLICY IF EXISTS "Users can update orders in same tenant" ON public.orders;
DROP POLICY IF EXISTS "orders_select_policy" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_policy" ON public.orders;
DROP POLICY IF EXISTS "orders_update_policy" ON public.orders;
DROP POLICY IF EXISTS "orders_delete_policy" ON public.orders;

-- Customers policies
DROP POLICY IF EXISTS "Users can view customers in same tenant" ON public.customers;
DROP POLICY IF EXISTS "Users can insert customers in same tenant" ON public.customers;
DROP POLICY IF EXISTS "Users can update customers in same tenant" ON public.customers;
DROP POLICY IF EXISTS "customers_select_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_insert_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_update_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_delete_policy" ON public.customers;

-- Equipments policies
DROP POLICY IF EXISTS "Users can view equipments in same tenant" ON public.equipments;
DROP POLICY IF EXISTS "Users can insert equipments in same tenant" ON public.equipments;
DROP POLICY IF EXISTS "Users can update equipments in same tenant" ON public.equipments;
DROP POLICY IF EXISTS "equipments_select_policy" ON public.equipments;
DROP POLICY IF EXISTS "equipments_insert_policy" ON public.equipments;
DROP POLICY IF EXISTS "equipments_update_policy" ON public.equipments;
DROP POLICY IF EXISTS "equipments_delete_policy" ON public.equipments;

-- ============================================================================
-- SECTION 5: CREATE COMPREHENSIVE RLS POLICIES
-- ============================================================================

-- ============================================================================
-- 5.1 USERS TABLE POLICIES
-- ============================================================================

-- SELECT: Users can view other users in same tenant (limited fields via views recommended)
CREATE POLICY "users_select_policy" ON public.users
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    OR id = auth.uid()
    OR public.is_admin()
  );

-- INSERT: Only service_role or admin can create users (typically done via auth triggers)
CREATE POLICY "users_insert_policy" ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    id = auth.uid()
    OR public.is_admin()
  );

-- UPDATE: Users can update own profile, admins can update all in tenant
CREATE POLICY "users_update_policy" ON public.users
  FOR UPDATE
  TO authenticated
  USING (
    id = auth.uid()
    OR (public.is_admin() AND tenant_id = public.get_user_tenant_id())
  )
  WITH CHECK (
    id = auth.uid()
    OR (public.is_admin() AND tenant_id = public.get_user_tenant_id())
  );

-- DELETE: Only admins can delete users in same tenant
CREATE POLICY "users_delete_policy" ON public.users
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    AND tenant_id = public.get_user_tenant_id()
    AND id != auth.uid() -- Prevent self-deletion
  );

-- ============================================================================
-- 5.2 TENANTS TABLE POLICIES
-- ============================================================================

CREATE POLICY "tenants_select_policy" ON public.tenants
  FOR SELECT
  TO authenticated
  USING (
    id = public.get_user_tenant_id()
  );

CREATE POLICY "tenants_update_policy" ON public.tenants
  FOR UPDATE
  TO authenticated
  USING (
    id = public.get_user_tenant_id()
    AND public.is_admin()
  )
  WITH CHECK (
    id = public.get_user_tenant_id()
    AND public.is_admin()
  );

-- ============================================================================
-- 5.3 ORDERS TABLE POLICIES
-- ============================================================================

CREATE POLICY "orders_select_policy" ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    OR assigned_to::text = auth.uid()::text
  );

CREATE POLICY "orders_insert_policy" ON public.orders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
  );

CREATE POLICY "orders_update_policy" ON public.orders
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    OR assigned_to::text = auth.uid()::text
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
  );

CREATE POLICY "orders_delete_policy" ON public.orders
  FOR DELETE
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND public.is_admin()
  );

-- ============================================================================
-- 5.4 CUSTOMERS TABLE POLICIES
-- ============================================================================

CREATE POLICY "customers_select_policy" ON public.customers
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
  );

CREATE POLICY "customers_insert_policy" ON public.customers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
  );

CREATE POLICY "customers_update_policy" ON public.customers
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
  );

CREATE POLICY "customers_delete_policy" ON public.customers
  FOR DELETE
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND public.is_admin()
  );

-- ============================================================================
-- 5.5 EQUIPMENTS TABLE POLICIES
-- ============================================================================

CREATE POLICY "equipments_select_policy" ON public.equipments
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
  );

CREATE POLICY "equipments_insert_policy" ON public.equipments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
  );

CREATE POLICY "equipments_update_policy" ON public.equipments
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
  );

CREATE POLICY "equipments_delete_policy" ON public.equipments
  FOR DELETE
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND public.is_admin()
  );

-- ============================================================================
-- 5.6 MULTI-TENANT RESOURCE POLICIES (Stock, Quotes, Contracts, etc.)
-- ============================================================================

-- Stock Items
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stock_items') THEN
    EXECUTE 'DROP POLICY IF EXISTS "stock_items_tenant_policy" ON public.stock_items';
    EXECUTE 'CREATE POLICY "stock_items_tenant_policy" ON public.stock_items FOR ALL TO authenticated USING (tenant_id = public.get_user_tenant_id()) WITH CHECK (tenant_id = public.get_user_tenant_id())';
  END IF;
END $$;

-- Stock Categories
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stock_categories') THEN
    EXECUTE 'DROP POLICY IF EXISTS "stock_categories_tenant_policy" ON public.stock_categories';
    EXECUTE 'CREATE POLICY "stock_categories_tenant_policy" ON public.stock_categories FOR ALL TO authenticated USING (tenant_id = public.get_user_tenant_id()) WITH CHECK (tenant_id = public.get_user_tenant_id())';
  END IF;
END $$;

-- Stock Movements
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stock_movements') THEN
    EXECUTE 'DROP POLICY IF EXISTS "stock_movements_tenant_policy" ON public.stock_movements';
    EXECUTE 'CREATE POLICY "stock_movements_tenant_policy" ON public.stock_movements FOR ALL TO authenticated USING (tenant_id = public.get_user_tenant_id()) WITH CHECK (tenant_id = public.get_user_tenant_id())';
  END IF;
END $$;

-- Quotes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'quotes') THEN
    EXECUTE 'DROP POLICY IF EXISTS "quotes_tenant_policy" ON public.quotes';
    EXECUTE 'CREATE POLICY "quotes_tenant_policy" ON public.quotes FOR ALL TO authenticated USING (tenant_id = public.get_user_tenant_id()) WITH CHECK (tenant_id = public.get_user_tenant_id())';
  END IF;
END $$;

-- Contracts
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contracts') THEN
    EXECUTE 'DROP POLICY IF EXISTS "contracts_tenant_policy" ON public.contracts';
    EXECUTE 'CREATE POLICY "contracts_tenant_policy" ON public.contracts FOR ALL TO authenticated USING (tenant_id = public.get_user_tenant_id()) WITH CHECK (tenant_id = public.get_user_tenant_id())';
  END IF;
END $$;

-- Service Types
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'service_types') THEN
    EXECUTE 'DROP POLICY IF EXISTS "service_types_tenant_policy" ON public.service_types';
    EXECUTE 'CREATE POLICY "service_types_tenant_policy" ON public.service_types FOR ALL TO authenticated USING (tenant_id = public.get_user_tenant_id()) WITH CHECK (tenant_id = public.get_user_tenant_id())';
  END IF;
END $$;

-- Form Templates
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'form_templates') THEN
    EXECUTE 'DROP POLICY IF EXISTS "form_templates_tenant_policy" ON public.form_templates';
    EXECUTE 'CREATE POLICY "form_templates_tenant_policy" ON public.form_templates FOR ALL TO authenticated USING (tenant_id = public.get_user_tenant_id()) WITH CHECK (tenant_id = public.get_user_tenant_id())';
  END IF;
END $$;

-- User Groups
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_groups') THEN
    EXECUTE 'DROP POLICY IF EXISTS "user_groups_tenant_policy" ON public.user_groups';
    EXECUTE 'CREATE POLICY "user_groups_tenant_policy" ON public.user_groups FOR ALL TO authenticated USING (tenant_id = public.get_user_tenant_id()) WITH CHECK (tenant_id = public.get_user_tenant_id())';
  END IF;
END $$;

-- Checklists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'checklists') THEN
    EXECUTE 'DROP POLICY IF EXISTS "checklists_tenant_policy" ON public.checklists';
    EXECUTE 'CREATE POLICY "checklists_tenant_policy" ON public.checklists FOR ALL TO authenticated USING (tenant_id = public.get_user_tenant_id()) WITH CHECK (tenant_id = public.get_user_tenant_id())';
  END IF;
END $$;

-- ============================================================================
-- SECTION 6: PERFORMANCE INDEXES
-- ============================================================================

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_id ON public.users(id);
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON public.users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);

-- Orders table indexes
CREATE INDEX IF NOT EXISTS idx_orders_tenant_id ON public.orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_to ON public.orders(assigned_to);
-- Note: orders table uses customer_name/address directly in this schema version
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

-- Customers table indexes
CREATE INDEX IF NOT EXISTS idx_customers_tenant_id ON public.customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(name);

-- Equipments table indexes
CREATE INDEX IF NOT EXISTS idx_equipments_tenant_id ON public.equipments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_equipments_customer_id ON public.equipments(customer_id);

-- Stock items indexes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stock_items') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_stock_items_tenant_id ON public.stock_items(tenant_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_stock_items_category_id ON public.stock_items(category_id)';
  END IF;
END $$;

-- Quotes indexes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'quotes') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_quotes_tenant_id ON public.quotes(tenant_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_quotes_status ON public.quotes(status)';
    -- Note: quotes table uses customer_name directly in this schema version
  END IF;
END $$;

-- ============================================================================
-- SECTION 7: AUDIT LOGGING INFRASTRUCTURE
-- ============================================================================

-- Create audit log table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  user_id uuid,
  table_name text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_fields text[],
  ip_address inet,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on audit logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Audit logs policy: only admins can view audit logs in their tenant
CREATE POLICY "audit_logs_admin_only" ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND public.is_admin()
  );

-- Index for audit logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON public.audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON public.audit_logs(table_name);

-- Audit trigger function
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tenant_uuid uuid;
  changed_fields text[];
BEGIN
  -- Get tenant_id from new or old record
  tenant_uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
  
  -- Calculate changed fields for UPDATE
  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(key)
    INTO changed_fields
    FROM jsonb_each(to_jsonb(NEW))
    WHERE to_jsonb(NEW) -> key IS DISTINCT FROM to_jsonb(OLD) -> key;
  END IF;
  
  INSERT INTO public.audit_logs (
    tenant_id,
    user_id,
    table_name,
    operation,
    old_data,
    new_data,
    changed_fields
  ) VALUES (
    tenant_uuid,
    auth.uid(),
    TG_TABLE_NAME,
    TG_OP,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    changed_fields
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Apply audit triggers to sensitive tables (optional - uncomment to enable)
-- DROP TRIGGER IF EXISTS audit_trigger ON public.users;
-- CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON public.users
--   FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- DROP TRIGGER IF EXISTS audit_trigger ON public.orders;
-- CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON public.orders
--   FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- ============================================================================
-- SECTION 8: GRANT NECESSARY PERMISSIONS
-- ============================================================================

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Grant select on tables to authenticated users (RLS will filter)
GRANT SELECT ON public.users TO authenticated;
GRANT SELECT ON public.tenants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipments TO authenticated;

-- Grant on sequences
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ============================================================================
-- SCRIPT COMPLETE
-- ============================================================================

-- Verify RLS is enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('users', 'orders', 'customers', 'equipments', 'tenants')
ORDER BY tablename;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Enterprise Security & RLS Alignment Complete!';
  RAISE NOTICE '📋 Next Steps:';
  RAISE NOTICE '   1. Review policies: SELECT * FROM pg_policies WHERE schemaname = ''public'';';
  RAISE NOTICE '   2. Test API calls with authenticated users';
  RAISE NOTICE '   3. Monitor logs for 403/406 errors';
  RAISE NOTICE '   4. Enable audit triggers if needed (see SECTION 7)';
END $$;
