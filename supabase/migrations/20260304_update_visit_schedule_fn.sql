-- ═══════════════════════════════════════════════════════════════════
-- DUNO — Função SECURITY DEFINER para reagendar visita
-- Bypassa RLS no UPDATE de service_visits e sincroniza orders
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

DROP FUNCTION IF EXISTS public.duno_update_visit_schedule(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.duno_update_visit_schedule(
    p_visit_id       TEXT,
    p_order_id       TEXT,
    p_scheduled_date TEXT,
    p_scheduled_time TEXT DEFAULT NULL,
    p_scheduled_end_time TEXT DEFAULT NULL,
    p_technician_id  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_current   RECORD;
    v_result    JSONB;
BEGIN
    -- Resolve tenant_id a partir da OS (não depende de JWT claim)
    SELECT tenant_id INTO v_tenant_id
    FROM public.orders
    WHERE id = p_order_id
    LIMIT 1;

    IF v_tenant_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'ORDER_NOT_FOUND');
    END IF;

    -- Busca snapshot atual para validação
    SELECT * INTO v_current
    FROM public.service_visits
    WHERE id = p_visit_id::UUID AND tenant_id = v_tenant_id
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'VISIT_NOT_FOUND');
    END IF;

    IF v_current.is_locked OR v_current.status = 'completed' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'VISIT_LOCKED');
    END IF;

    -- Atualiza a visita
    UPDATE public.service_visits
    SET
        scheduled_date     = p_scheduled_date::DATE,
        scheduled_time     = NULLIF(p_scheduled_time, ''),
        scheduled_end_time = NULLIF(p_scheduled_end_time, ''),
        technician_id      = CASE WHEN p_technician_id IS NOT NULL AND p_technician_id <> ''
                                  THEN p_technician_id::UUID
                                  ELSE technician_id END,
        updated_at         = NOW()
    WHERE id = p_visit_id::UUID AND tenant_id = v_tenant_id;

    -- Sincroniza orders (link público + dados gerais)
    UPDATE public.orders
    SET
        scheduled_date = p_scheduled_date::DATE,
        scheduled_time = NULLIF(p_scheduled_time, ''),
        assigned_to    = CASE WHEN p_technician_id IS NOT NULL AND p_technician_id <> ''
                              THEN p_technician_id::UUID
                              ELSE assigned_to END,
        updated_at     = NOW()
    WHERE id = p_order_id AND tenant_id = v_tenant_id;

    -- Retorna a visita atualizada
    SELECT to_jsonb(sv) INTO v_result
    FROM public.service_visits sv
    WHERE sv.id = p_visit_id::UUID AND sv.tenant_id = v_tenant_id;

    RETURN jsonb_build_object('ok', true, 'visit', v_result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.duno_update_visit_schedule(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
