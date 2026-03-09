-- =====================================================================================
-- NEXUS PRO - SCRIPT DE CORREÇÃO: GATILHOS DE SISTEMA & RLS
-- =====================================================================================

BEGIN;

-- 1. SOLUÇÃO PRINCIPAL: Tornar os gatilhos de criação automática imunes a bloqueios de RLS 
-- Aplicando padrão de Engenharia "Security Definer" para que o próprio banco crie as visitas livremente.
CREATE OR REPLACE FUNCTION public.auto_create_first_visit_on_os_insert()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.assigned_to IS NOT NULL THEN
        INSERT INTO public.service_visits (
            tenant_id, order_id, technician_id, status, scheduled_date, scheduled_time, created_by
        ) VALUES (
            NEW.tenant_id, NEW.id, NEW.assigned_to, 'pending', NEW.scheduled_date, NEW.scheduled_time, COALESCE(auth.uid(), NEW.assigned_to)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.auto_create_visit_on_reassign()
RETURNS TRIGGER AS $$
DECLARE
    v_has_pending_visit BOOLEAN;
BEGIN
    IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
        SELECT EXISTS (
             SELECT 1 FROM public.service_visits 
             WHERE order_id = NEW.id 
               AND technician_id = NEW.assigned_to 
               AND status IN ('pending', 'ongoing')
        ) INTO v_has_pending_visit;

        IF NOT v_has_pending_visit THEN
            INSERT INTO public.service_visits (
                tenant_id, order_id, technician_id, status, scheduled_date, scheduled_time, created_by
            ) VALUES (
                NEW.tenant_id, NEW.id, NEW.assigned_to, 'pending', NEW.scheduled_date, NEW.scheduled_time, COALESCE(auth.uid(), NEW.assigned_to)
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. AJUSTE FINO DE RLS: Prevenir erros de letreamento (maiúsculas/minúsculas)
DROP POLICY IF EXISTS "Visits SELECT" ON public.service_visits;
DROP POLICY IF EXISTS "Visits ALL" ON public.service_visits;

CREATE POLICY "Visits SELECT" ON public.service_visits
    FOR SELECT USING (
        (LOWER(COALESCE((auth.jwt() -> 'user_metadata' ->> 'role'), '')) IN ('admin', 'manager') AND tenant_id = COALESCE((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid, (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid))
        OR
        (LOWER(COALESCE((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'technician' AND 
            EXISTS (
                SELECT 1 FROM public.orders o 
                WHERE o.id = service_visits.order_id 
                  AND o.assigned_to = auth.uid()
            )
        )
    );

CREATE POLICY "Visits ALL" ON public.service_visits
    FOR ALL USING (
        (LOWER(COALESCE((auth.jwt() -> 'user_metadata' ->> 'role'), '')) IN ('admin', 'manager') AND tenant_id = COALESCE((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid, (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid))
        OR
        (LOWER(COALESCE((auth.jwt() -> 'user_metadata' ->> 'role'), '')) = 'technician' AND technician_id = auth.uid())
    );

COMMIT;
