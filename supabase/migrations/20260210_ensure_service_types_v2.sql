-- FIX RPC 400 ERROR BY RENAMING FUNCTION (CACHE BUSTING)
-- Date: 2026-02-10
-- Issue: Supabase PostgREST cache seems stuck on old function signature
-- Solution: Create NEW function with different name to bypass cache issues

-- 1. Create NEW function with distinct name
CREATE OR REPLACE FUNCTION public.rpc_ensure_service_types(payload json DEFAULT '{}'::json)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id uuid;
BEGIN
    -- Get current user's tenant
    v_tenant_id := public.get_user_tenant_id();
    
    IF v_tenant_id IS NULL THEN
        SELECT tenant_id INTO v_tenant_id FROM public.users WHERE id = auth.uid();
    END IF;

    IF v_tenant_id IS NULL THEN
        RAISE WARNING 'No tenant found for current user';
        RETURN;
    END IF;

    -- Insert default types if they don't exist
    INSERT INTO public.service_types (tenant_id, name, description, active)
    VALUES 
        (v_tenant_id, 'Visita Técnica', 'Atendimento geral', true),
        (v_tenant_id, 'Manutenção Preventiva', 'Visita de rotina programada', true),
        (v_tenant_id, 'Manutenção Corretiva', 'Reparo de falhas ou quebras', true),
        (v_tenant_id, 'Instalação', 'Instalação de novos equipamentos', true),
        (v_tenant_id, 'Garantia', 'Atendimento em garantia', true)
    ON CONFLICT DO NOTHING;
    
    IF NOT EXISTS (SELECT 1 FROM public.service_types WHERE tenant_id = v_tenant_id) THEN
         INSERT INTO public.service_types (tenant_id, name, description, active)
        VALUES 
            (v_tenant_id, 'Visita Técnica', 'Atendimento geral', true),
            (v_tenant_id, 'Manutenção Preventiva', 'Visita de rotina programada', true),
            (v_tenant_id, 'Manutenção Corretiva', 'Reparo de falhas ou quebras', true),
            (v_tenant_id, 'Instalação', 'Instalação de novos equipamentos', true),
            (v_tenant_id, 'Garantia', 'Atendimento em garantia', true);
    END IF;
END;
$$;

-- 2. Grant permissions
GRANT EXECUTE ON FUNCTION public.rpc_ensure_service_types(json) TO authenticated;

-- 3. Reload schema
NOTIFY pgrst, 'reload schema';

-- 4. Execute to test
SELECT public.rpc_ensure_service_types('{}'::json);
