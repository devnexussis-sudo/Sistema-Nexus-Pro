-- ==============================================================================
-- MIGRATION: IMPLEMENTAÇÃO DE ROW LEVEL SECURITY GRANULAR BASEADA EM JSON (GRUPOS)
-- ==============================================================================
-- Instruções: Copie este script e execute no SQL Editor do Supabase Dashboard.

BEGIN;

-- 1. FUNÇÃO MESTRE DE VERIFICAÇÃO DE PERMISSÕES
CREATE OR REPLACE FUNCTION public.has_module_permission(module_name text, action_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_user RECORD;
  v_group RECORD;
  v_permissions JSONB;
  v_module_data JSONB;
BEGIN
  -- Buscar dados básicos do usuário
  SELECT role, group_id, permissions INTO v_user
  FROM public.users
  WHERE id = auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Master Admins têm acesso irrestrito
  IF UPPER(v_user.role::text) = 'SUPER_ADMIN' THEN
    RETURN true;
  END IF;

  -- Técnicos (App) bypassam a checagem rígida do painel web para não quebrar o aplicativo
  -- As restrições deles são tratadas em outras políticas de RLS e validações de API
  IF UPPER(v_user.role::text) = 'TECHNICIAN' THEN
    RETURN true;
  END IF;

  -- Extrair Permissões do Grupo ou do próprio usuário
  IF v_user.group_id IS NOT NULL THEN
    SELECT name, permissions INTO v_group
    FROM public.user_groups
    WHERE id = v_user.group_id
    LIMIT 1;

    -- O grupo "Administradores" é o grupo master do sistema
    IF v_group.name ILIKE 'administradores' THEN
      RETURN true;
    END IF;

    v_permissions := v_group.permissions;
  ELSE
    v_permissions := v_user.permissions;
  END IF;

  -- Sem permissões, acesso negado
  IF v_permissions IS NULL THEN
    RETURN false;
  END IF;

  -- Extrair a configuração do módulo solicitado
  v_module_data := v_permissions -> module_name;

  IF v_module_data IS NULL THEN
    RETURN false;
  END IF;

  -- Módulo Booleano (ex: manageUsers: true, manageGroups: true)
  IF jsonb_typeof(v_module_data) = 'boolean' THEN
    RETURN v_module_data::boolean;
  END IF;

  -- Módulo com Ações Granulares (ex: orders: { read: true, delete: false })
  IF jsonb_typeof(v_module_data) = 'object' THEN
    IF v_module_data ->> action_name = 'true' THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;


-- =========================================================================================
-- 2. APLICAÇÃO DE POLÍTICAS NAS TABELAS CRÍTICAS (Substituindo políticas antigas e frouxas)
-- =========================================================================================

-- ----------------------------------------------------
-- A. ORDERS (Atividades)
-- ----------------------------------------------------
DROP POLICY IF EXISTS "orders_all_access_tenant" ON public.orders;

CREATE POLICY "orders_select_tenant" ON public.orders FOR SELECT TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('orders', 'read'));

CREATE POLICY "orders_insert_tenant" ON public.orders FOR INSERT TO authenticated
WITH CHECK (tenant_id = get_auth_tenant_id() AND has_module_permission('orders', 'create'));

CREATE POLICY "orders_update_tenant" ON public.orders FOR UPDATE TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('orders', 'update'));

CREATE POLICY "orders_delete_tenant" ON public.orders FOR DELETE TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('orders', 'delete'));


-- ----------------------------------------------------
-- B. CUSTOMERS (Clientes)
-- ----------------------------------------------------
DROP POLICY IF EXISTS "customers_all_access_tenant" ON public.customers;

CREATE POLICY "customers_select_tenant" ON public.customers FOR SELECT TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('customers', 'read'));

CREATE POLICY "customers_insert_tenant" ON public.customers FOR INSERT TO authenticated
WITH CHECK (tenant_id = get_auth_tenant_id() AND has_module_permission('customers', 'create'));

CREATE POLICY "customers_update_tenant" ON public.customers FOR UPDATE TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('customers', 'update'));

CREATE POLICY "customers_delete_tenant" ON public.customers FOR DELETE TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('customers', 'delete'));


-- ----------------------------------------------------
-- C. EQUIPMENTS (Ativos/Equipamentos)
-- ----------------------------------------------------
DROP POLICY IF EXISTS "equipments_all_access_tenant" ON public.equipments;

CREATE POLICY "equipments_select_tenant" ON public.equipments FOR SELECT TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('equipments', 'read'));

CREATE POLICY "equipments_insert_tenant" ON public.equipments FOR INSERT TO authenticated
WITH CHECK (tenant_id = get_auth_tenant_id() AND has_module_permission('equipments', 'create'));

CREATE POLICY "equipments_update_tenant" ON public.equipments FOR UPDATE TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('equipments', 'update'));

CREATE POLICY "equipments_delete_tenant" ON public.equipments FOR DELETE TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('equipments', 'delete'));


-- ----------------------------------------------------
-- D. TECHNICIANS (Técnicos)
-- ----------------------------------------------------
DROP POLICY IF EXISTS "technicians_all_access_tenant" ON public.technicians;

CREATE POLICY "technicians_select_tenant" ON public.technicians FOR SELECT TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('technicians', 'read'));

CREATE POLICY "technicians_insert_tenant" ON public.technicians FOR INSERT TO authenticated
WITH CHECK (tenant_id = get_auth_tenant_id() AND has_module_permission('technicians', 'create'));

CREATE POLICY "technicians_update_tenant" ON public.technicians FOR UPDATE TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('technicians', 'update'));

CREATE POLICY "technicians_delete_tenant" ON public.technicians FOR DELETE TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('technicians', 'delete'));


-- ----------------------------------------------------
-- E. QUOTES (Orçamentos)
-- ----------------------------------------------------
DROP POLICY IF EXISTS "quotes_all_access_tenant" ON public.quotes;

CREATE POLICY "quotes_select_tenant" ON public.quotes FOR SELECT TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('quotes', 'read'));

CREATE POLICY "quotes_insert_tenant" ON public.quotes FOR INSERT TO authenticated
WITH CHECK (tenant_id = get_auth_tenant_id() AND has_module_permission('quotes', 'create'));

CREATE POLICY "quotes_update_tenant" ON public.quotes FOR UPDATE TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('quotes', 'update'));

CREATE POLICY "quotes_delete_tenant" ON public.quotes FOR DELETE TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('quotes', 'delete'));


-- ----------------------------------------------------
-- F. USERS & GROUPS (Usuários e Grupos)
-- ----------------------------------------------------
DROP POLICY IF EXISTS "users_all_access_tenant" ON public.users;

CREATE POLICY "users_select_tenant" ON public.users FOR SELECT TO authenticated
-- Usuário sempre pode ler e editar a própria conta, mas para ver os demais precisa de permissão
USING (id = auth.uid() OR (tenant_id = get_auth_tenant_id() AND has_module_permission('manageUsers', 'read')));

CREATE POLICY "users_insert_tenant" ON public.users FOR INSERT TO authenticated
WITH CHECK (tenant_id = get_auth_tenant_id() AND has_module_permission('manageUsers', 'create'));

CREATE POLICY "users_update_tenant" ON public.users FOR UPDATE TO authenticated
USING (id = auth.uid() OR (tenant_id = get_auth_tenant_id() AND has_module_permission('manageUsers', 'update')));

CREATE POLICY "users_delete_tenant" ON public.users FOR DELETE TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('manageUsers', 'delete'));

DROP POLICY IF EXISTS "user_groups_all_access_tenant" ON public.user_groups;
CREATE POLICY "user_groups_select_tenant" ON public.user_groups FOR SELECT TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('manageGroups', 'read'));

CREATE POLICY "user_groups_insert_tenant" ON public.user_groups FOR INSERT TO authenticated
WITH CHECK (tenant_id = get_auth_tenant_id() AND has_module_permission('manageGroups', 'create'));

CREATE POLICY "user_groups_update_tenant" ON public.user_groups FOR UPDATE TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('manageGroups', 'update'));

CREATE POLICY "user_groups_delete_tenant" ON public.user_groups FOR DELETE TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('manageGroups', 'delete'));


-- ----------------------------------------------------
-- G. FINANCIAL (Financeiro) 
-- ----------------------------------------------------
DROP POLICY IF EXISTS "Admins can do everything on their tenant's invoices" ON public.invoices;
DROP POLICY IF EXISTS "invoices_all_access_tenant" ON public.invoices;

CREATE POLICY "invoices_select_tenant" ON public.invoices FOR SELECT TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('financial', 'read'));

CREATE POLICY "invoices_insert_tenant" ON public.invoices FOR INSERT TO authenticated
WITH CHECK (tenant_id = get_auth_tenant_id() AND has_module_permission('financial', 'update'));

CREATE POLICY "invoices_update_tenant" ON public.invoices FOR UPDATE TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('financial', 'update'));

CREATE POLICY "invoices_delete_tenant" ON public.invoices FOR DELETE TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('financial', 'update'));

DROP POLICY IF EXISTS "Admins can do everything on their tenant's accounts_payable" ON public.accounts_payable;
DROP POLICY IF EXISTS "accounts_payable_all_access_tenant" ON public.accounts_payable;

CREATE POLICY "payable_select_tenant" ON public.accounts_payable FOR SELECT TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('financial', 'read'));

CREATE POLICY "payable_insert_tenant" ON public.accounts_payable FOR INSERT TO authenticated
WITH CHECK (tenant_id = get_auth_tenant_id() AND has_module_permission('financial', 'update'));

CREATE POLICY "payable_update_tenant" ON public.accounts_payable FOR UPDATE TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('financial', 'update'));

CREATE POLICY "payable_delete_tenant" ON public.accounts_payable FOR DELETE TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('financial', 'update'));

DROP POLICY IF EXISTS "Admins can do everything on their tenant's cash_flow" ON public.cash_flow;
DROP POLICY IF EXISTS "cash_flow_all_access_tenant" ON public.cash_flow;

CREATE POLICY "cashflow_select_tenant" ON public.cash_flow FOR SELECT TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('financial', 'read'));

CREATE POLICY "cashflow_insert_tenant" ON public.cash_flow FOR INSERT TO authenticated
WITH CHECK (tenant_id = get_auth_tenant_id() AND has_module_permission('financial', 'update'));

CREATE POLICY "cashflow_update_tenant" ON public.cash_flow FOR UPDATE TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('financial', 'update'));

CREATE POLICY "cashflow_delete_tenant" ON public.cash_flow FOR DELETE TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('financial', 'update'));


-- ----------------------------------------------------
-- H. STOCK (Estoque)
-- ----------------------------------------------------
DROP POLICY IF EXISTS "stock_items_all_access_tenant" ON public.stock_items;

CREATE POLICY "stock_select_tenant" ON public.stock_items FOR SELECT TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('stock', 'read'));

CREATE POLICY "stock_insert_tenant" ON public.stock_items FOR INSERT TO authenticated
WITH CHECK (tenant_id = get_auth_tenant_id() AND has_module_permission('stock', 'create'));

CREATE POLICY "stock_update_tenant" ON public.stock_items FOR UPDATE TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('stock', 'update'));

CREATE POLICY "stock_delete_tenant" ON public.stock_items FOR DELETE TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('stock', 'delete'));

DROP POLICY IF EXISTS "stock_categories_all_access_tenant" ON public.stock_categories;
CREATE POLICY "stock_cat_select_tenant" ON public.stock_categories FOR SELECT TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('stock', 'read'));

CREATE POLICY "stock_cat_insert_tenant" ON public.stock_categories FOR INSERT TO authenticated
WITH CHECK (tenant_id = get_auth_tenant_id() AND has_module_permission('stock', 'create'));

CREATE POLICY "stock_cat_update_tenant" ON public.stock_categories FOR UPDATE TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('stock', 'update'));

CREATE POLICY "stock_cat_delete_tenant" ON public.stock_categories FOR DELETE TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('stock', 'delete'));


-- ----------------------------------------------------
-- I. FORMS (Formulários)
-- ----------------------------------------------------
DROP POLICY IF EXISTS "form_templates_all_access_tenant" ON public.form_templates;

CREATE POLICY "forms_select_tenant" ON public.form_templates FOR SELECT TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('forms', 'read'));

CREATE POLICY "forms_insert_tenant" ON public.form_templates FOR INSERT TO authenticated
WITH CHECK (tenant_id = get_auth_tenant_id() AND has_module_permission('forms', 'create'));

CREATE POLICY "forms_update_tenant" ON public.form_templates FOR UPDATE TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('forms', 'update'));

CREATE POLICY "forms_delete_tenant" ON public.form_templates FOR DELETE TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('forms', 'delete'));


-- ----------------------------------------------------
-- J. INTEGRATIONS (Integrações e Webhooks)
-- ----------------------------------------------------
DROP POLICY IF EXISTS "api_keys_isolation_policy" ON public.api_keys;

CREATE POLICY "api_keys_select_tenant" ON public.api_keys FOR SELECT TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('integrations', 'read'));

CREATE POLICY "api_keys_insert_tenant" ON public.api_keys FOR INSERT TO authenticated
WITH CHECK (tenant_id = get_auth_tenant_id() AND has_module_permission('integrations', 'create'));

CREATE POLICY "api_keys_update_tenant" ON public.api_keys FOR UPDATE TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('integrations', 'update'));

CREATE POLICY "api_keys_delete_tenant" ON public.api_keys FOR DELETE TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('integrations', 'delete'));

DROP POLICY IF EXISTS "webhooks_isolation_policy" ON public.webhooks;
CREATE POLICY "webhooks_select_tenant" ON public.webhooks FOR SELECT TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('integrations', 'read'));

CREATE POLICY "webhooks_insert_tenant" ON public.webhooks FOR INSERT TO authenticated
WITH CHECK (tenant_id = get_auth_tenant_id() AND has_module_permission('integrations', 'create'));

CREATE POLICY "webhooks_update_tenant" ON public.webhooks FOR UPDATE TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('integrations', 'update'));

CREATE POLICY "webhooks_delete_tenant" ON public.webhooks FOR DELETE TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('integrations', 'delete'));


-- ----------------------------------------------------
-- K. REGIONS (Gestão de Região)
-- ----------------------------------------------------
DROP POLICY IF EXISTS "service_regions_all_access_tenant" ON public.service_regions;

CREATE POLICY "regions_select_tenant" ON public.service_regions FOR SELECT TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('regions', 'read'));

CREATE POLICY "regions_insert_tenant" ON public.service_regions FOR INSERT TO authenticated
WITH CHECK (tenant_id = get_auth_tenant_id() AND has_module_permission('regions', 'create'));

CREATE POLICY "regions_update_tenant" ON public.service_regions FOR UPDATE TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('regions', 'update'));

CREATE POLICY "regions_delete_tenant" ON public.service_regions FOR DELETE TO authenticated
USING (tenant_id = get_auth_tenant_id() AND has_module_permission('regions', 'delete'));


COMMIT;
