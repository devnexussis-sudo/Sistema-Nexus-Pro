-- =====================================================================================
-- FIX: REASSIGN VISIT TRIGGER (Transfer OS without duplicating visits)
-- =====================================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.auto_create_visit_on_reassign()
RETURNS TRIGGER AS $$
DECLARE
    v_has_pending_visit BOOLEAN;
    v_old_pending_visit_id UUID;
BEGIN
    -- Se houve troca de tecnico (ou remocao)
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
        
        -- 1. Verifica se o tecnico antigo tinha uma visita pendente
        IF OLD.assigned_to IS NOT NULL THEN
            SELECT id INTO v_old_pending_visit_id 
            FROM public.service_visits 
            WHERE order_id = NEW.id 
              AND technician_id = OLD.assigned_to 
              AND status = 'pending'
            LIMIT 1;
        END IF;

        -- 2. Se a OS foi desatribuida (Nenhum tecnico)
        IF NEW.assigned_to IS NULL THEN
            IF v_old_pending_visit_id IS NOT NULL THEN
                DELETE FROM public.service_visits WHERE id = v_old_pending_visit_id;
            END IF;
        
        -- 3. Se a OS foi atribuida para um novo tecnico
        ELSE
            IF v_old_pending_visit_id IS NOT NULL THEN
                -- Transfere a visita pendente atual para o novo tecnico (evita duplicacao)
                UPDATE public.service_visits 
                SET technician_id = NEW.assigned_to,
                    updated_at = NOW()
                WHERE id = v_old_pending_visit_id;
            ELSE
                -- O tecnico antigo nao tinha visita pendente (talvez fosse 'ongoing' ou nao tinha tecnico).
                -- Verifica se o novo tecnico ja tem visita. Se nao, cria uma nova.
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
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
