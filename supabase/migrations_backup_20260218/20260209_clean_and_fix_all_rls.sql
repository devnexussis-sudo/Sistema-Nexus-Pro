-- ==============================================================================
-- LIMPEZA GERAL DE POLICIES E FIX DE DEADLOCK (VERSÃO ROBUSTA V2)
-- ==============================================================================

-- 1. CORREÇÃO DAS FUNÇÕES BASE (Anti-Recursão)
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
  -- Tenta JWT
  tenant_uuid := NULLIF(current_setting('request.jwt.claims', true)::json->>'metaTenant', '')::uuid;
  IF tenant_uuid IS NULL THEN
    tenant_uuid := NULLIF(current_setting('request.jwt.claims', true)::json->>'tenant_id', '')::uuid;
  END IF;
  
  IF tenant_uuid IS NOT NULL THEN RETURN tenant_uuid; END IF;

  -- Tenta Banco (Direto, sem trigger de RLS)
  SELECT tenant_id INTO tenant_uuid FROM public.users WHERE id = auth.uid();
  RETURN tenant_uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  role_check text;
BEGIN
  role_check := current_setting('request.jwt.claims', true)::json->>'user_role';
  IF role_check ILIKE 'admin' THEN RETURN true; END IF;
  
  SELECT role INTO role_check FROM public.users WHERE id = auth.uid();
  RETURN (role_check ILIKE 'admin');
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

-- 2. LIMPEZA TOTAL DE POLICIES (DROP ALL)
-- Removemos TODAS as variações possíveis para evitar erro "policy already exists"

-- >>> USERS
DROP POLICY IF EXISTS "users_select_policy" ON public.users;
DROP POLICY IF EXISTS "users_update_policy" ON public.users;
DROP POLICY IF EXISTS "users_insert_policy" ON public.users;
DROP POLICY IF EXISTS "users_delete_policy" ON public.users;
DROP POLICY IF EXISTS "users_insert_admin" ON public.users;
DROP POLICY IF EXISTS "users_delete_admin" ON public.users;
DROP POLICY IF EXISTS "Users can view users in same tenant" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
DROP POLICY IF EXISTS "Admins can manage all users in tenant" ON public.users;
DROP POLICY IF EXISTS "Admins manage users" ON public.users;
DROP POLICY IF EXISTS "Users view same tenant" ON public.users;
DROP POLICY IF EXISTS "Users update own profile or admins update all" ON public.users;

-- Recria Users (Limpo e Seguro)
CREATE POLICY "users_select_policy" ON public.users FOR SELECT TO authenticated
USING (id = auth.uid() OR tenant_id = public.get_user_tenant_id() OR public.is_admin());

CREATE POLICY "users_update_policy" ON public.users FOR UPDATE TO authenticated
USING (id = auth.uid() OR (public.is_admin() AND tenant_id = public.get_user_tenant_id()));

CREATE POLICY "users_insert_admin" ON public.users FOR INSERT TO authenticated
WITH CHECK (public.is_admin() OR id = auth.uid());

CREATE POLICY "users_delete_admin" ON public.users FOR DELETE TO authenticated
USING (public.is_admin());


-- >>> ORDERS
DROP POLICY IF EXISTS "Tenant isolation orders" ON public.orders;
DROP POLICY IF EXISTS "Orders INSERT/UPDATE" ON public.orders;
DROP POLICY IF EXISTS "Orders SELECT" ON public.orders;
DROP POLICY IF EXISTS "orders_select_policy" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_policy" ON public.orders;
DROP POLICY IF EXISTS "orders_update_policy" ON public.orders;
DROP POLICY IF EXISTS "orders_delete_policy" ON public.orders;
DROP POLICY IF EXISTS "Orders Public Read" ON public.orders;
DROP POLICY IF EXISTS "orders_isolation_policy" ON public.orders;

-- Recria Orders (Unificado)
CREATE POLICY "orders_isolation_policy" ON public.orders FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id())
WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Orders Public Read" ON public.orders FOR SELECT TO anon
USING (public_token IS NOT NULL);


-- >>> CUSTOMERS
DROP POLICY IF EXISTS "Tenant isolation customers" ON public.customers;
DROP POLICY IF EXISTS "Tenant isolation customers ALL" ON public.customers;
DROP POLICY IF EXISTS "Tenant isolation customers SELECT" ON public.customers;
DROP POLICY IF EXISTS "customers_select_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_insert_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_update_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_delete_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_isolation_policy" ON public.customers;

-- Recria Customers
CREATE POLICY "customers_isolation_policy" ON public.customers FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id())
WITH CHECK (tenant_id = public.get_user_tenant_id());


-- >>> CONTRACTS
DROP POLICY IF EXISTS "Tenant isolation contracts" ON public.contracts;
DROP POLICY IF EXISTS "tenant_contracts" ON public.contracts;
DROP POLICY IF EXISTS "contracts_isolation_policy" ON public.contracts;

-- Recria Contracts
CREATE POLICY "contracts_isolation_policy" ON public.contracts FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id())
WITH CHECK (tenant_id = public.get_user_tenant_id());


-- >>> STOCK & OTHERS
DROP POLICY IF EXISTS "tenant_stock_categories" ON public.stock_categories;
DROP POLICY IF EXISTS "Tenant isolation stock categories" ON public.stock_categories;
DROP POLICY IF EXISTS "stock_categories_isolation_policy" ON public.stock_categories;

CREATE POLICY "stock_categories_isolation_policy" ON public.stock_categories FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id())
WITH CHECK (tenant_id = public.get_user_tenant_id());


DROP POLICY IF EXISTS "tenant_technicians" ON public.technicians;
DROP POLICY IF EXISTS "Tenant isolation technicians" ON public.technicians;
DROP POLICY IF EXISTS "technicians_isolation_policy" ON public.technicians;

CREATE POLICY "technicians_isolation_policy" ON public.technicians FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id())
WITH CHECK (tenant_id = public.get_user_tenant_id());


-- >>> TENANTS
DROP POLICY IF EXISTS "Users can view own tenant" ON public.tenants;
DROP POLICY IF EXISTS "Admins can update own tenant" ON public.tenants;
DROP POLICY IF EXISTS "tenants_select_policy" ON public.tenants;
DROP POLICY IF EXISTS "tenants_update_policy" ON public.tenants;

-- Recria Tenants
CREATE POLICY "tenants_select_policy" ON public.tenants FOR SELECT TO authenticated
USING (id = public.get_user_tenant_id());

CREATE POLICY "tenants_update_policy" ON public.tenants FOR UPDATE TO authenticated
USING (id = public.get_user_tenant_id() AND public.is_admin())
WITH CHECK (id = public.get_user_tenant_id());


-- 3. GARANTE ÍNDICES (Performance)
CREATE INDEX IF NOT EXISTS idx_users_id_fast ON public.users(id);
CREATE INDEX IF NOT EXISTS idx_users_tenant_id_fast ON public.users(tenant_id);

-- 4. FINALIZAÇÃO
NOTIFY pgrst, 'reload schema';
