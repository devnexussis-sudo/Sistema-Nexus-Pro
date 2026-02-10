-- FIX SERVICE TYPES DATA AND UUID COMPATIBILITY
-- Date: 2026-02-10
-- Issue: Frontend is using 'st-001' strings which crash Supabase requests (expecting UUID)
-- Solution: Ensure valid service types exist with valid UUIDs

-- 1. Function to ensure service types exist for a tenant
CREATE OR REPLACE FUNCTION public.ensure_default_service_types()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_tenant_id uuid;
BEGIN
    -- Get current user's tenant
    v_tenant_id := public.get_user_tenant_id();
    
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

-- 2. Clean up any invalid data provided it doesn't break integrity
-- (Supabase checks UUID validity on input, so 'st-001' cannot be in the DB id column)

-- 3. Execute for current session user (if run from SQL editor)
SELECT public.ensure_default_service_types();
