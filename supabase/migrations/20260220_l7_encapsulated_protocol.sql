-- =====================================================================================
-- NEXUS PRO - RECURSO L7: PROTOCOLO ENCAPSULADO (SERVICE VISITS)
-- =====================================================================================
-- Descrição: 
-- 1. Modifica service_visits para "Encapsular" o form_data localmente na visita.
-- 2. Cria gatilhos para auto-gerar Visitas sempre que uma OS ganhar um Técnico.
-- =====================================================================================

BEGIN;

-- 1. ESTRUTURAR O SERVICE_VISITS PARA RECEBER DADOS DA VISITA
ALTER TABLE public.service_visits
ADD COLUMN IF NOT EXISTS form_data JSONB DEFAULT '{}'::jsonb;

-- 2. GATILHOS (TRIGGERS) PARA AUTO-ENCAPSULAMENTO DA OS

-- 2.1 Função para criar Visita ao INSERIR uma OS (se ela nascer já com Técnico)
CREATE OR REPLACE FUNCTION public.auto_create_first_visit_on_os_insert()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.assigned_to IS NOT NULL THEN
        INSERT INTO public.service_visits (
            tenant_id, order_id, technician_id, status, scheduled_date, scheduled_time, created_by
        ) VALUES (
            NEW.tenant_id, NEW.id, NEW.assigned_to, 'pending', NEW.scheduled_date, NEW.scheduled_time, NEW.assigned_to
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_create_first_visit_on_order ON public.orders;
CREATE TRIGGER trg_create_first_visit_on_order
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE PROCEDURE public.auto_create_first_visit_on_os_insert();


-- 2.2 Função para criar Visita ao ATUALIZAR Técnico ou Data (Se já não houver Pending/Ongoing)
CREATE OR REPLACE FUNCTION public.auto_create_visit_on_reassign()
RETURNS TRIGGER AS $$
DECLARE
    v_has_pending_visit BOOLEAN;
BEGIN
    -- Se o técnico não for nulo e for diferente do que estava antes
    IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
        
        -- Verifica se já existe uma visita ativa ou pendente para esse usuário nessa OS
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
                NEW.tenant_id, NEW.id, NEW.assigned_to, 'pending', NEW.scheduled_date, NEW.scheduled_time, NEW.assigned_to
            );
        END IF;

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_create_visit_on_reassign ON public.orders;
CREATE TRIGGER trg_create_visit_on_reassign
AFTER UPDATE OF assigned_to ON public.orders
FOR EACH ROW EXECUTE PROCEDURE public.auto_create_visit_on_reassign();

COMMIT;
