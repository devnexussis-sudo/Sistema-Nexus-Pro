-- ==============================================================================
-- Nexus Pro - Super Admin God Mode
-- Padrão Big Tech: Global IAM (Identity and Access Management) Pattern
-- ==============================================================================
-- A tabela 'global_admins' é a ÚNICA fonte de verdade para Super Admins.
-- A Edge Function 'master-auth-validate' insere automaticamente o usuário
-- nesta tabela ao fazer login no Painel Master. Sem hardcode de emails.
-- ==============================================================================

BEGIN;

-- 1. Tabela IAM Global (Matriz de Permissões)
CREATE TABLE IF NOT EXISTS public.global_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  granted_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.global_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "system_read_global_admins" ON public.global_admins;
CREATE POLICY "system_read_global_admins" ON public.global_admins
FOR SELECT TO authenticated USING (true);

-- Apenas Global Admins podem gerenciar a tabela
DROP POLICY IF EXISTS "global_admins_manage" ON public.global_admins;
CREATE POLICY "global_admins_manage" ON public.global_admins
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.global_admins WHERE user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.global_admins WHERE user_id = auth.uid()));


-- 2. Função de detecção de God Mode (Otimizada com STABLE para cache do planner)
CREATE OR REPLACE FUNCTION public.is_master_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.global_admins 
    WHERE user_id = auth.uid()
  );
$$;


-- 3. Aplicar God Mode Aditivo a todas as tabelas acessadas pelo frontend
DO $$ 
DECLARE
  v_table_name text;
  tables_to_update text[] := ARRAY[
    'activation_rules', 'api_keys', 'cash_flow', 'contracts', 'customers', 
    'equipments', 'form_templates', 'order_impediments', 'orders', 'quotes', 
    'service_types', 'service_visits', 'stock_categories', 'stock_items', 
    'system_notification_reads', 'system_notifications', 'technicians', 
    'tenants', 'user_groups', 'users', 'visit_status_history', 'webhooks', 
    'whatsapp_service_requests'
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

COMMIT;
