-- FIX SERVICE TYPES DATA AND UUID COMPATIBILITY (V2)
-- Date: 2026-02-10
-- Improved: Added SECURITY DEFINER and schema reload
-- Issue: Frontend is using 'st-001' strings which crash Supabase requests (expecting UUID)

-- 1. Function to ensure service types exist for a tenant
CREATE OR REPLACE FUNCTION public.ensure_default_service_types()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER  -- Allows function to run with creator permissions (bypass RLS if needed inside)
SET search_path = public -- Secure search path
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
    
    -- Note: We can't easily rely on name uniqueness unless there's a unique constraint on (tenant_id, name)
    -- So we just insert common ones if the table is empty for this tenant
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

-- 2. Grant execute permission strictly
GRANT EXECUTE ON FUNCTION public.ensure_default_service_types() TO authenticated;

-- 3. Reload schema cache (CRITICAL for RPC to be visible)
NOTIFY pgrst, 'reload schema';

-- 4. Initial run
SELECT public.ensure_default_service_types();
