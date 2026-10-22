-- ==============================================================================
-- MIGRAÇÃO DE ENDURECIMENTO: AUDITORIA E WITH CHECK GRANULAR PARA SUPER ADMIN
-- Padrão: Missão Crítica / Big Tech Compliance / NASA-Grade Resilience
-- ==============================================================================

BEGIN;

-- 1. Função de Auditoria Automática para Ações de Super Admin / God Mode
CREATE OR REPLACE FUNCTION public.audit_master_admin_action()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_master boolean;
  v_old_json jsonb;
  v_new_json jsonb;
  v_record_id text;
  v_tenant_id text;
  v_changed_by text;
  v_claims jsonb;
  v_user_agent text;
BEGIN
  -- 🛡️ 1. Executa auditoria EXCLUSIVAMENTE quando acionado por um Super Admin global
  BEGIN
    v_is_master := public.is_master_admin();
  EXCEPTION WHEN OTHERS THEN
    v_is_master := false;
  END;

  IF NOT v_is_master THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- 🛡️ 2. Conversão serializada segura em JSONB (preveni exceções de tipo ou schema)
  v_old_json := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  v_new_json := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END;

  -- 🛡️ 3. Resolução universal de ID do registro
  v_record_id := COALESCE(v_new_json ->> 'id', v_old_json ->> 'id', 'unknown');

  -- 🛡️ 4. Resolução contextual do Tenant ID
  IF TG_TABLE_NAME = 'tenants' THEN
    v_tenant_id := v_record_id;
  ELSE
    v_tenant_id := COALESCE(v_new_json ->> 'tenant_id', v_old_json ->> 'tenant_id');
  END IF;

  -- 🛡️ 5. Resolução de identidade do operador Super Admin
  v_changed_by := auth.uid()::text;
  IF v_changed_by IS NULL THEN
    BEGIN
      v_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
      v_changed_by := COALESCE(v_claims ->> 'sub', v_claims ->> 'email', 'master-superadmin');
    EXCEPTION WHEN OTHERS THEN
      v_changed_by := 'master-superadmin';
    END IF;
  END IF;

  -- Captura opcional do User-Agent da requisição HTTP
  BEGIN
    v_user_agent := current_setting('request.headers', true)::jsonb ->> 'user-agent';
  EXCEPTION WHEN OTHERS THEN
    v_user_agent := 'SuperAdmin Console';
  END;

  -- 🛡️ 6. Gravação atômica e resiliente na tabela de audit_logs (Fail-Safe NASA)
  BEGIN
    INSERT INTO public.audit_logs (
      tenant_id,
      table_name,
      record_id,
      action,
      old_values,
      new_values,
      changed_by,
      changed_at,
      user_agent
    ) VALUES (
      v_tenant_id,
      TG_TABLE_NAME,
      v_record_id,
      '[GOD_MODE] ' || TG_OP,
      v_old_json,
      v_new_json,
      v_changed_by,
      NOW(),
      COALESCE(v_user_agent, 'SuperAdmin Impersonation')
    );
  EXCEPTION WHEN OTHERS THEN
    -- Alerta sem abortar a operação em produção
    RAISE WARNING '[AUDIT_SUPERADMIN] Registro de auditoria ignorado por exceção: %', SQLERRM;
  END;

  RETURN COALESCE(NEW, OLD);
END;
$$;

GRANT EXECUTE ON FUNCTION public.audit_master_admin_action() TO authenticated, anon, service_role;


-- 2. Acoplar Triggers de Auditoria Super Admin em todas as tabelas corporativas
DO $$ 
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'orders', 'quotes', 'customers', 'equipments', 'technicians', 'users', 'tenants', 
    'contracts', 'stock_items', 'service_visits', 'invoices', 'accounts_payable', 
    'cash_flow', 'user_groups', 'whatsapp_messages', 'system_notifications', 
    'defect_types', 'service_regions', 'commission_rules', 'activation_rules', 
    'api_keys', 'webhooks', 'stock_categories', 'form_templates', 'order_impediments',
    'invoice_installments', 'visit_status_history', 'whatsapp_service_requests'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = v_table) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_master_admin ON public.%I', v_table);
      EXECUTE format('
        CREATE TRIGGER trg_audit_master_admin
        AFTER INSERT OR UPDATE OR DELETE ON public.%I
        FOR EACH ROW
        EXECUTE FUNCTION public.audit_master_admin_action();
      ', v_table);
    END IF;
  END LOOP;
END $$;


-- 3. Atualizar Políticas RLS "god_mode_all_*" com WITH CHECK Granular
DO $$ 
DECLARE
  v_table_name text;
  has_tenant_col boolean;
  tables_to_update text[] := ARRAY[
    'activation_rules', 'api_keys', 'cash_flow', 'accounts_payable', 'invoices', 
    'invoice_installments', 'contracts', 'customers', 'equipments', 'form_templates', 
    'order_impediments', 'orders', 'quotes', 'service_types', 'service_visits', 
    'stock_categories', 'stock_items', 'system_notification_reads', 'system_notifications', 
    'technicians', 'tenants', 'user_groups', 'users', 'visit_status_history', 'webhooks', 
    'whatsapp_messages', 'whatsapp_service_requests', 'defect_types', 'service_regions',
    'commission_rules', 'audit_logs'
  ];
BEGIN
  FOREACH v_table_name IN ARRAY tables_to_update
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = v_table_name) THEN
      EXECUTE format('DROP POLICY IF EXISTS "god_mode_all_%s" ON public.%I', v_table_name, v_table_name);
      
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = v_table_name AND column_name = 'tenant_id'
      ) INTO has_tenant_col;

      -- Regras específicas por tabela para blindagem e granularidade
      IF v_table_name = 'users' THEN
        EXECUTE '
          CREATE POLICY "god_mode_all_users" ON public.users 
          FOR ALL TO authenticated 
          USING (public.is_master_admin())
          WITH CHECK (
            public.is_master_admin() AND 
            (tenant_id IS NOT NULL OR role::text = ''SUPER_ADMIN'' OR id = auth.uid())
          );
        ';
      ELSIF v_table_name = 'tenants' THEN
        EXECUTE '
          CREATE POLICY "god_mode_all_tenants" ON public.tenants 
          FOR ALL TO authenticated 
          USING (public.is_master_admin())
          WITH CHECK (public.is_master_admin() AND id IS NOT NULL);
        ';
      ELSIF v_table_name = 'system_notifications' OR v_table_name = 'audit_logs' THEN
        EXECUTE format('
          CREATE POLICY "god_mode_all_%s" ON public.%I 
          FOR ALL TO authenticated 
          USING (public.is_master_admin())
          WITH CHECK (public.is_master_admin());
        ', v_table_name, v_table_name);
      ELSIF has_tenant_col THEN
        EXECUTE format('
          CREATE POLICY "god_mode_all_%s" ON public.%I 
          FOR ALL TO authenticated 
          USING (public.is_master_admin())
          WITH CHECK (public.is_master_admin() AND tenant_id IS NOT NULL);
        ', v_table_name, v_table_name);
      ELSE
        EXECUTE format('
          CREATE POLICY "god_mode_all_%s" ON public.%I 
          FOR ALL TO authenticated 
          USING (public.is_master_admin())
          WITH CHECK (public.is_master_admin());
        ', v_table_name, v_table_name);
      END IF;
    END IF;
  END LOOP;
END $$;

-- 4. Garantir permissões completas nas tabelas e sequências
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

COMMIT;

-- 5. Notificar PostgREST para recarregar o schema cache imediatamente
NOTIFY pgrst, 'reload schema';
