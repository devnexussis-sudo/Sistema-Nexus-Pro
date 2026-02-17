-- ==============================================================================
-- FINALIZAÇÃO DA PADRONIZAÇÃO DE RLS (CLEAN CODE & SECURITY V3)
-- Tabela por Tabela -> Remove nomes antigos -> Cria Isolation Policy Padrão
-- ==============================================================================

-- >>> EQUIPMENTS
DROP POLICY IF EXISTS "Tenant isolation equipments" ON public.equipments;
DROP POLICY IF EXISTS "equipments_select_policy" ON public.equipments;
DROP POLICY IF EXISTS "equipments_insert_policy" ON public.equipments;
DROP POLICY IF EXISTS "equipments_update_policy" ON public.equipments;
DROP POLICY IF EXISTS "equipments_delete_policy" ON public.equipments;

CREATE POLICY "equipments_isolation_policy" ON public.equipments FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id())
WITH CHECK (tenant_id = public.get_user_tenant_id());


-- >>> QUOTES
DROP POLICY IF EXISTS "Tenant isolation quotes" ON public.quotes;
DROP POLICY IF EXISTS "quotes_tenant_policy" ON public.quotes;

CREATE POLICY "quotes_isolation_policy" ON public.quotes FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id())
WITH CHECK (tenant_id = public.get_user_tenant_id());


-- >>> STOCK ITEMS
DROP POLICY IF EXISTS "Tenant isolation stock" ON public.stock_items;
DROP POLICY IF EXISTS "stock_items_tenant_policy" ON public.stock_items;

CREATE POLICY "stock_items_isolation_policy" ON public.stock_items FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id())
WITH CHECK (tenant_id = public.get_user_tenant_id());


-- >>> STOCK MOVEMENTS
DROP POLICY IF EXISTS "Tenant isolation stock movements" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_tenant_policy" ON public.stock_movements;

CREATE POLICY "stock_movements_isolation_policy" ON public.stock_movements FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id())
WITH CHECK (tenant_id = public.get_user_tenant_id());


-- >>> SERVICE TYPES
DROP POLICY IF EXISTS "tenant_service_types" ON public.service_types;
DROP POLICY IF EXISTS "service_types_tenant_policy" ON public.service_types;

CREATE POLICY "service_types_isolation_policy" ON public.service_types FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id())
WITH CHECK (tenant_id = public.get_user_tenant_id());


-- >>> FORM TEMPLATES
DROP POLICY IF EXISTS "tenant_form_templates" ON public.form_templates;
DROP POLICY IF EXISTS "form_templates_tenant_policy" ON public.form_templates;

CREATE POLICY "form_templates_isolation_policy" ON public.form_templates FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id())
WITH CHECK (tenant_id = public.get_user_tenant_id());


-- >>> ACTIVATION RULES
DROP POLICY IF EXISTS "tenant_activation_rules" ON public.activation_rules;

CREATE POLICY "activation_rules_isolation_policy" ON public.activation_rules FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id())
WITH CHECK (tenant_id = public.get_user_tenant_id());


-- >>> USER GROUPS
DROP POLICY IF EXISTS "tenant_user_groups" ON public.user_groups;
DROP POLICY IF EXISTS "user_groups_tenant_policy" ON public.user_groups;

CREATE POLICY "user_groups_isolation_policy" ON public.user_groups FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id())
WITH CHECK (tenant_id = public.get_user_tenant_id());


-- >>> SYSTEM NOTIFICATIONS
DROP POLICY IF EXISTS "tenant_notifications" ON public.system_notifications;

CREATE POLICY "notifications_isolation_policy" ON public.system_notifications FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id())
WITH CHECK (tenant_id = public.get_user_tenant_id());


-- >>> AUDIT LOGS (Admin Only)
DROP POLICY IF EXISTS "Audit admin read" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_admin_only" ON public.audit_logs;

CREATE POLICY "audit_logs_admin_policy" ON public.audit_logs FOR SELECT TO authenticated
USING (public.is_admin() AND tenant_id = public.get_user_tenant_id());


-- FINAL SYNC
NOTIFY pgrst, 'reload schema';
