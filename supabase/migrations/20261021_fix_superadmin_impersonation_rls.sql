-- ==============================================================================
-- MIGRAÇÃO DEFINITIVA: RLS E ACESSO SUPER ADMIN IMPERSONATION
-- Padrão: Missão Crítica / Big Tech IAM / Zero Contaminação Cruzada
-- ==============================================================================
--
-- PROBLEMA IDENTIFICADO:
-- Quando o Super Admin acessa o painel de um tenant via "Acessar" (impersonation),
-- as políticas RLS usam:
--   USING (tenant_id = get_auth_tenant_id() AND has_module_permission(modulo, 'read'))
--
-- 1. get_auth_tenant_id() retorna NULL ou o ID master do Super Admin, pois o JWT
--    do Super Admin não pertence àquele tenant.
-- 2. has_module_permission() busca public.users WHERE id = auth.uid(). O Super Admin
--    global NÃO existe na tabela users daquele tenant, retornando false imediatamente.
-- 3. Resultado: 100% dos registros de ordens, técnicos, clientes, orçamentos,
--    usuários, equipamentos, etc. eram filtrados pelo PostgreSQL (painel vazio).
--
-- SOLUÇÃO:
-- 1. is_master_admin() otimizada e blindada para reconhecer global_admins, metadata
--    e emails autorizados de Super Admin.
-- 2. has_module_permission() retorna true imediatamente se is_master_admin() for true.
-- 3. Políticas aditivas god_mode_all_* aplicadas a todas as tabelas acessadas pelo
--    painel, permitindo que o Super Admin consulte e opere em dados do tenant
--    (com o isolamento do tenant sendo garantido pelo filtro .eq('tenant_id', tid) do frontend).
-- 4. Usuários normais permanecem 100% restritos às políticas de tenant_id existentes.
-- ==============================================================================

BEGIN;

-- 1. Função is_master_admin: Detecta Super Admin global com máxima resiliência
CREATE OR REPLACE FUNCTION public.is_master_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.global_admins 
    WHERE user_id = auth.uid()
  )
  OR (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role') IN ('moros_admin', 'SUPER_ADMIN')
  OR (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role') IN ('moros_admin', 'SUPER_ADMIN')
  OR (current_setting('request.jwt.claims', true)::jsonb ->> 'email') IN ('master@dunoup.com.br', 'alex.ksc20@gmail.com')
  OR EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'SUPER_ADMIN'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_master_admin() TO authenticated, anon, service_role;

-- 2. Função has_module_permission: Super Admin tem passe livre imediato
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
  -- 🛡️ 1. Master Admins (Super Admin global) têm acesso irrestrito a todos os módulos
  IF public.is_master_admin() THEN
    RETURN true;
  END IF;

  -- 2. Buscar dados básicos do usuário no banco
  SELECT role, group_id, permissions INTO v_user
  FROM public.users
  WHERE id = auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Usuário com role SUPER_ADMIN na tabela users
  IF UPPER(v_user.role::text) = 'SUPER_ADMIN' THEN
    RETURN true;
  END IF;

  -- Técnicos (App) bypassam a checagem rígida do painel web para não quebrar o aplicativo
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

GRANT EXECUTE ON FUNCTION public.has_module_permission(text, text) TO authenticated, anon, service_role;

-- 3. Políticas Aditivas God Mode para o Super Admin
-- Garante que o Super Admin possa visualizar e gerenciar registros de qualquer tenant durante a impersonation
DO $$ 
DECLARE
  v_table_name text;
  tables_to_update text[] := ARRAY[
    'activation_rules', 'api_keys', 'cash_flow', 'accounts_payable', 'invoices', 
    'invoice_installments', 'contracts', 'customers', 'equipments', 'form_templates', 
    'order_impediments', 'orders', 'quotes', 'service_types', 'service_visits', 
    'stock_categories', 'stock_items', 'system_notification_reads', 'system_notifications', 
    'technicians', 'tenants', 'user_groups', 'users', 'visit_status_history', 'webhooks', 
    'whatsapp_messages', 'whatsapp_service_requests', 'defect_types', 'service_regions',
    'commission_rules'
  ];
BEGIN
  FOREACH v_table_name IN ARRAY tables_to_update
  LOOP
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = v_table_name) THEN
      EXECUTE format('DROP POLICY IF EXISTS "god_mode_all_%s" ON public.%I', v_table_name, v_table_name);
      EXECUTE format('
        CREATE POLICY "god_mode_all_%s" ON public.%I 
        FOR ALL TO authenticated 
        USING (public.is_master_admin())
        WITH CHECK (public.is_master_admin());
      ', v_table_name, v_table_name);
    END IF;
  END LOOP;
END $$;

-- 4. Garantir permissões de schema para a role authenticated
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

COMMIT;

-- 5. Notificar PostgREST para recarregar o schema cache imediatamente
NOTIFY pgrst, 'reload schema';
