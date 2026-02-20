-- =====================================================================================
-- NEXUS PRO - SCRIPT TITANIUM: PREVENÇÃO DE ERROS DE TIMELINE NA RPC
-- =====================================================================================

BEGIN;

-- 1. DELETAMOS A VERSÃO ANTIGA PARA EVITAR CONFLITO DE TIPAGEM (UUID vs TEXT)
DROP FUNCTION IF EXISTS public.get_order_timeline(TEXT, UUID);
DROP FUNCTION IF EXISTS public.get_order_timeline(TEXT, TEXT);

-- 2. RECRIAMOS A FUNÇÃO DE MODO "BLINDADO" (Todas as IDs como TEXT, verificações de null)
CREATE OR REPLACE FUNCTION public.get_order_timeline(p_order_id TEXT, p_tenant_id TEXT)
RETURNS TABLE (
    event_id TEXT,
    event_type TEXT,
    event_date TIMESTAMPTZ,
    user_id TEXT,
    user_name TEXT,
    details JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
BEGIN
    RETURN QUERY
    
    -- Evento 1: Criação da OS
    SELECT 
        o.id::TEXT AS event_id,
        'ORDER_CREATED'::TEXT AS event_type,
        o.created_at AS event_date,
        o.assigned_to::TEXT AS user_id,
        u.name::TEXT AS user_name,
        jsonb_build_object('title', o.title, 'status', o.status) AS details
    FROM public.orders o
    LEFT JOIN public.users u ON u.id::TEXT = o.assigned_to::TEXT
    WHERE o.id = p_order_id AND o.tenant_id::TEXT = p_tenant_id

    UNION ALL
    
    -- Eventos 2.1: Visitas (AGENDADA/CRIADA)
    SELECT 
        sv.id::TEXT AS event_id,
        'VISIT_PENDING'::TEXT AS event_type,
        sv.created_at AS event_date,
        sv.created_by::TEXT AS user_id,
        u.name::TEXT AS user_name,
        jsonb_build_object(
            'scheduled_date', sv.scheduled_date,
            'scheduled_time', sv.scheduled_time,
            'notes', sv.notes,
            'assigned_tech', t.name
        ) AS details
    FROM public.service_visits sv
    LEFT JOIN public.users u ON u.id::TEXT = sv.created_by::TEXT
    LEFT JOIN public.users t ON t.id::TEXT = sv.technician_id::TEXT
    WHERE sv.order_id = p_order_id AND sv.tenant_id::TEXT = p_tenant_id

    UNION ALL

    -- Eventos 2.2: Visitas (INICIADA)
    SELECT 
        sv.id::TEXT AS event_id,
        'VISIT_ONGOING'::TEXT AS event_type,
        sv.arrival_time AS event_date,
        sv.technician_id::TEXT AS user_id,
        v_user.name::TEXT AS user_name,
        jsonb_build_object() AS details
    FROM public.service_visits sv
    LEFT JOIN public.users v_user ON v_user.id::TEXT = sv.technician_id::TEXT
    WHERE sv.order_id = p_order_id AND sv.tenant_id::TEXT = p_tenant_id AND sv.arrival_time IS NOT NULL

    UNION ALL

    -- Eventos 2.3: Visitas (PAUSADA)
    SELECT 
        sv.id::TEXT AS event_id,
        'VISIT_PAUSED'::TEXT AS event_type,
        sv.updated_at AS event_date,
        sv.technician_id::TEXT AS user_id,
        v_user.name::TEXT AS user_name,
        jsonb_build_object('pause_reason', sv.pause_reason) AS details
    FROM public.service_visits sv
    LEFT JOIN public.users v_user ON v_user.id::TEXT = sv.technician_id::TEXT
    WHERE sv.order_id = p_order_id AND sv.tenant_id::TEXT = p_tenant_id AND sv.status = 'paused'

    UNION ALL

    -- Eventos 2.4: Visitas (CONCLUÍDA)
    SELECT 
        sv.id::TEXT AS event_id,
        'VISIT_COMPLETED'::TEXT AS event_type,
        sv.departure_time AS event_date,
        sv.technician_id::TEXT AS user_id,
        v_user.name::TEXT AS user_name,
        jsonb_build_object('form_data', sv.form_data) AS details
    FROM public.service_visits sv
    LEFT JOIN public.users v_user ON v_user.id::TEXT = sv.technician_id::TEXT
    WHERE sv.order_id = p_order_id AND sv.tenant_id::TEXT = p_tenant_id AND sv.status = 'completed' AND sv.departure_time IS NOT NULL

    UNION ALL

    -- Eventos 3: Audit Logs (Mudança de Status)
    SELECT 
        al.id::TEXT AS event_id,
        'STATUS_CHANGED'::TEXT AS event_type,
        al.changed_at::TIMESTAMPTZ AS event_date,
        al.changed_by::TEXT AS user_id,
        au.name::TEXT AS user_name,
        jsonb_build_object(
            'old_status', al.old_values->>'status',
            'new_status', al.new_values->>'status'
        ) AS details
    FROM public.audit_logs al
    LEFT JOIN public.users au ON au.id::TEXT = al.changed_by::TEXT
    WHERE al.table_name = 'orders' 
      AND al.record_id = p_order_id 
      AND al.tenant_id::TEXT = p_tenant_id
      AND al.action = 'UPDATE'
      AND al.old_values->>'status' IS DISTINCT FROM al.new_values->>'status'
      AND al.changed_at IS NOT NULL
      
    UNION ALL

    -- Eventos 4: Atribuição de Técnico
    SELECT 
        al.id::TEXT AS event_id,
        'TECH_ASSIGNED'::TEXT AS event_type,
        al.changed_at::TIMESTAMPTZ AS event_date,
        al.changed_by::TEXT AS user_id,
        au.name::TEXT AS user_name,
        jsonb_build_object(
            'old_tech', al.old_values->>'assigned_to',
            'new_tech', al.new_values->>'assigned_to'
        ) AS details
    FROM public.audit_logs al
    LEFT JOIN public.users au ON au.id::TEXT = al.changed_by::TEXT
    WHERE al.table_name = 'orders' 
      AND al.record_id = p_order_id 
      AND al.tenant_id::TEXT = p_tenant_id
      AND al.action = 'UPDATE'
      AND al.old_values->>'assigned_to' IS DISTINCT FROM al.new_values->>'assigned_to'
      AND al.changed_at IS NOT NULL

    UNION ALL

    -- Eventos 5: Relógio do Sistema (Mudança de Horário)
    SELECT 
        al.id::TEXT AS event_id,
        'SCHEDULE_CHANGED'::TEXT AS event_type,
        al.changed_at::TIMESTAMPTZ AS event_date,
        al.changed_by::TEXT AS user_id,
        au.name::TEXT AS user_name,
        jsonb_build_object(
            'old_date', al.old_values->>'scheduled_date',
            'new_date', al.new_values->>'scheduled_date',
            'old_time', al.old_values->>'scheduled_time',
            'new_time', al.new_values->>'scheduled_time'
        ) AS details
    FROM public.audit_logs al
    LEFT JOIN public.users au ON au.id::TEXT = al.changed_by::TEXT
    WHERE al.table_name = 'orders' 
      AND al.record_id = p_order_id 
      AND al.tenant_id::TEXT = p_tenant_id
      AND al.action = 'UPDATE'
      AND (
          al.old_values->>'scheduled_date' IS DISTINCT FROM al.new_values->>'scheduled_date'
          OR al.old_values->>'scheduled_time' IS DISTINCT FROM al.new_values->>'scheduled_time'
      )
      AND al.changed_at IS NOT NULL

    ORDER BY event_date ASC;
END;
$BODY$;

COMMIT;
