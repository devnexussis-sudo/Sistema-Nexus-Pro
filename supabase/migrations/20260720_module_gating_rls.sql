-- ==============================================================================
-- Nexus Pro - Big Tech SaaS Module Gating
-- Implementation: RESTRICTIVE RLS Policies
-- ==============================================================================
-- Objetivo: Garantir que se um módulo for desabilitado pelo SuperAdmin, 
-- nenhuma requisição (seja via UI ou API REST) consiga ler ou escrever dados.
-- O frontend atualizará via Realtime, e o backend usará políticas RESTRICTIVE
-- que funcionam como um grande filtro "AND" antes das políticas normais.
-- ==============================================================================

BEGIN;

-- 1. Função super rápida (STABLE) para checar o status do módulo
CREATE OR REPLACE FUNCTION public.is_module_enabled_for_auth(module_name text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  -- O God Mode (Master) nunca é bloqueado por módulos
  SELECT CASE
    WHEN public.is_master_admin() THEN true
    ELSE COALESCE(
      (SELECT (enabled_modules->>module_name)::boolean 
       FROM public.tenants 
       WHERE id = public.get_auth_tenant_id()
      ),
      true -- Fallback: se a chave do módulo não existir no JSON, deixa passar (true)
    )
  END;
$$;


-- 2. Criar políticas RESTRICTIVE (Atuam como um "Super AND" para bloquear acesso)
-- Se a função retornar false, a linha não será retornada/modificada de jeito nenhum.

DO $$ 
DECLARE
  v_table text;
  v_module text;
  mapping_table text[][] := ARRAY[
    ['orders', 'orders'],
    ['customers', 'customers'],
    ['technicians', 'technicians'],
    ['quotes', 'quotes'],
    ['contracts', 'contracts'],
    ['cash_flow', 'financial'],
    ['form_templates', 'forms'],
    ['stock_items', 'stock'],
    ['stock_categories', 'stock'],
    ['equipments', 'equipments'],
    ['whatsapp_service_requests', 'ai']
  ];
  item text[];
BEGIN
  FOREACH item SLICE 1 IN ARRAY mapping_table
  LOOP
    v_table := item[1];
    v_module := item[2];
    
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = v_table) THEN
      
      -- Limpar a política se já existir
      EXECUTE format('DROP POLICY IF EXISTS "gating_%s_%s" ON public.%I', v_table, v_module, v_table);
      
      -- Criar a política RESTRICTIVE
      EXECUTE format('
        CREATE POLICY "gating_%s_%s" ON public.%I 
        AS RESTRICTIVE 
        FOR ALL TO authenticated 
        USING (public.is_module_enabled_for_auth(''%s''))
        WITH CHECK (public.is_module_enabled_for_auth(''%s''));
      ', v_table, v_module, v_table, v_module, v_module);
      
    END IF;
  END LOOP;
END $$;

COMMIT;
