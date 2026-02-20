-- =====================================================================================
-- NEXUS PRO - SCRIPT TITANIUM PLUS: RLS Estrito e Sincronização Automática
-- =====================================================================================

BEGIN;

-- 1. STRICT RLS POLICIES FOR SECURE CONTEXT READ/WRITE
DROP POLICY IF EXISTS "Visits SELECT" ON public.service_visits;
DROP POLICY IF EXISTS "Visits ALL" ON public.service_visits;

-- Leitura (Read-Only Context)
CREATE POLICY "Visits SELECT" ON public.service_visits
    FOR SELECT USING (
        -- Admins ou Managers podem ler tudo no seu tenant
        (COALESCE((auth.jwt() -> 'user_metadata' ->> 'role'), '') IN ('admin', 'manager') AND tenant_id = COALESCE((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid, (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid))
        OR
        -- Techs podem ler TUDO daquele protocolo (OS), independente de quem atendeu a visita antiga
        (COALESCE((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'technician' AND 
            EXISTS (
                SELECT 1 FROM public.orders o 
                WHERE o.id = service_visits.order_id 
                  AND o.assigned_to = auth.uid()
            )
        )
    );

-- Escrita (Mutações - Formulário)
CREATE POLICY "Visits ALL" ON public.service_visits
    FOR ALL USING (
        -- Admins ou Managers podem tudo
        (COALESCE((auth.jwt() -> 'user_metadata' ->> 'role'), '') IN ('admin', 'manager') AND tenant_id = COALESCE((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid, (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid))
        OR
        -- Techs SÓ podem dar UPDATE/INSERT na linha onde o seu ID está como dono da visita!
        (COALESCE((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'technician' AND technician_id = auth.uid())
    );

-- 2. TRIGGER DE SINCRONIZACAO INTELIGENTE (VISITA => OS)
-- O Admin ganha visibilidade instantanea. Se o tech der start, pause ou fim, a OS muda!
CREATE OR REPLACE FUNCTION public.sync_order_status_from_visit()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'paused' AND OLD.status IS DISTINCT FROM 'paused' THEN
        UPDATE public.orders 
        SET status = 'PAUSED', pause_reason = NEW.pause_reason, updated_at = NOW()
        WHERE id = NEW.order_id;
    END IF;

    IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
        UPDATE public.orders 
        SET status = 'COMPLETED', end_date = NOW(), updated_at = NOW()
        WHERE id = NEW.order_id;
    END IF;

    IF NEW.status = 'ongoing' AND OLD.status IS DISTINCT FROM 'ongoing' THEN
        UPDATE public.orders 
        SET status = 'IN_PROGRESS', start_date = COALESCE(start_date, NOW()), updated_at = NOW()
        WHERE id = NEW.order_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_order_status_from_visit ON public.service_visits;
CREATE TRIGGER trg_sync_order_status_from_visit
AFTER UPDATE OF status ON public.service_visits
FOR EACH ROW
EXECUTE PROCEDURE public.sync_order_status_from_visit();

COMMIT;
