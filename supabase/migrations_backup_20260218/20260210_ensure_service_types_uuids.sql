-- FIX SERVICE TYPES DATA AND UUID COMPATIBILITY (V3 - ROBUST RPC)
-- Date: 2026-02-10
-- Improved: Accepts optional JSON parameter to prevent 400 Bad Request
-- Issue: Some client versions send empty body, others send {}, causing 400 errors for void functions

-- 1. DROP previous function sig just in case
DROP FUNCTION IF EXISTS public.ensure_default_service_types();

-- 2. CREATE robust function that accepts ANY payload (even if ignored)
CREATE OR REPLACE FUNCTION public.ensure_default_service_types(payload json DEFAULT '{}'::json)
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
        -- Try to get from auth.uid() directly as fallback
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

-- 3. Grant execute permission
GRANT EXECUTE ON FUNCTION public.ensure_default_service_types(json) TO authenticated;

-- 4. Reload schema cache (CRITICAL)
NOTIFY pgrst, 'reload schema';

-- 5. Initial run (simulating call with empty object)
SELECT public.ensure_default_service_types('{}'::json);
