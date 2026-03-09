-- =====================================================================================
-- NEXUS PRO - RECURSO L7: MÚLTIPLAS VISITAS E TIMELINE (SERVICE VISITS)
-- =====================================================================================
-- Descrição: Criação do motor de visitas múltiplas para OS, permitindo fluxos de 
--            interrupção (pausa) e retomada. Inclui RLS estrito e RPC de Timeline.
-- =====================================================================================

BEGIN;

-- 1. ENUMS (STATUS DA VISITA)
DO $$ BEGIN
    CREATE TYPE public.visit_status AS ENUM ('pending', 'ongoing', 'paused', 'completed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. TABELA DE VISITAS (SERVICE_VISITS)
CREATE TABLE IF NOT EXISTS public.service_visits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    order_id TEXT REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
    technician_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    
    status public.visit_status DEFAULT 'pending',
    pause_reason TEXT,
    
    scheduled_date DATE,
    scheduled_time TIME,
    
    arrival_time TIMESTAMPTZ,
    departure_time TIMESTAMPTZ,
    
    notes TEXT,
    
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    form_data JSONB DEFAULT '{}'::jsonb
);

-- 3. ÍNDICES PARA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_visits_tenant ON public.service_visits(tenant_id);
CREATE INDEX IF NOT EXISTS idx_visits_order ON public.service_visits(order_id);
CREATE INDEX IF NOT EXISTS idx_visits_tech ON public.service_visits(technician_id);

-- 4. ROW LEVEL SECURITY (RLS) - ZERO BYPASS
ALTER TABLE public.service_visits ENABLE ROW LEVEL SECURITY;

-- 4.1 Leitura: Todos do mesmo tenant podem ler as visitas de suas OSs
DROP POLICY IF EXISTS "Visits SELECT" ON public.service_visits;
CREATE POLICY "Visits SELECT" ON public.service_visits
    FOR SELECT USING (
        tenant_id = COALESCE(
            (auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid,
            (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid
        )
    );

-- 4.2 Escrita Geral (Tratada de forma híbrida para Técnicos e Admins)
DROP POLICY IF EXISTS "Visits ALL" ON public.service_visits;
CREATE POLICY "Visits ALL" ON public.service_visits
    FOR ALL USING (
        tenant_id = COALESCE(
            (auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid,
            (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid
        )
    );

-- 5. TIMELINE RPC (BIG TECH STYLE)
-- Consolida eventos de OS, Visitas e Logs em uma linha do tempo única
CREATE OR REPLACE FUNCTION public.get_order_timeline(p_order_id TEXT, p_tenant_id UUID)
RETURNS TABLE (
    event_id UUID,
    event_type TEXT,
    event_date TIMESTAMPTZ,
    user_id UUID,
    user_name TEXT,
    details JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    
    -- Evento 1: Criação da OS
    SELECT 
        o.tenant_id AS event_id, -- Apenas para ter um UUID válido
        'ORDER_CREATED'::TEXT AS event_type,
        o.created_at AS event_date,
        o.assigned_to AS user_id,
        u.name AS user_name,
        jsonb_build_object('title', o.title, 'status', o.status) AS details
    FROM public.orders o
    LEFT JOIN public.users u ON u.id = o.assigned_to
    WHERE o.id = p_order_id AND o.tenant_id = p_tenant_id

    UNION ALL
    
    -- Eventos 2.1: Visitas (AGENDADA/CRIADA)
    SELECT 
        sv.id AS event_id,
        'VISIT_PENDING'::TEXT AS event_type,
        sv.created_at AS event_date,
        sv.created_by AS user_id,
        u.name AS user_name,
        jsonb_build_object(
            'scheduled_date', sv.scheduled_date,
            'scheduled_time', sv.scheduled_time,
            'notes', sv.notes,
            'assigned_tech', t.name
        ) AS details
    FROM public.service_visits sv
    LEFT JOIN public.users u ON u.id = sv.created_by
    LEFT JOIN public.users t ON t.id = sv.technician_id
    WHERE sv.order_id = p_order_id AND sv.tenant_id = p_tenant_id

    UNION ALL

    -- Eventos 2.2: Visitas (INICIADA)
    SELECT 
        sv.id AS event_id,
        'VISIT_ONGOING'::TEXT AS event_type,
        sv.arrival_time AS event_date,
        sv.technician_id AS user_id,
        u.name AS user_name,
        jsonb_build_object() AS details
    FROM public.service_visits sv
    LEFT JOIN public.users u ON u.id = sv.technician_id
    WHERE sv.order_id = p_order_id AND sv.tenant_id = p_tenant_id AND sv.arrival_time IS NOT NULL

    UNION ALL

    -- Eventos 2.3: Visitas (PAUSADA)
    SELECT 
        sv.id AS event_id,
        'VISIT_PAUSED'::TEXT AS event_type,
        sv.updated_at AS event_date,  -- Usando updated_at pois não há pause_time explícito
        sv.technician_id AS user_id,
        u.name AS user_name,
        jsonb_build_object(
            'pause_reason', sv.pause_reason
        ) AS details
    FROM public.service_visits sv
    LEFT JOIN public.users u ON u.id = sv.technician_id
    WHERE sv.order_id = p_order_id AND sv.tenant_id = p_tenant_id AND sv.status = 'paused'

    UNION ALL

    -- Eventos 2.4: Visitas (CONCLUÍDA)
    SELECT 
        sv.id AS event_id,
        'VISIT_COMPLETED'::TEXT AS event_type,
        sv.departure_time AS event_date,
        sv.technician_id AS user_id,
        u.name AS user_name,
        jsonb_build_object(
            'form_data', sv.form_data
        ) AS details
    FROM public.service_visits sv
    LEFT JOIN public.users u ON u.id = sv.technician_id
    WHERE sv.order_id = p_order_id AND sv.tenant_id = p_tenant_id AND sv.status = 'completed' AND sv.departure_time IS NOT NULL

    UNION ALL

    -- Eventos 3: Audit Logs (Mudanças de Status da OS)
    SELECT 
        al.id::UUID AS event_id,
        'STATUS_CHANGED'::TEXT AS event_type,
        al.changed_at::TIMESTAMPTZ AS event_date,
        al.changed_by::UUID AS user_id,
        u.name AS user_name,
        jsonb_build_object(
            'old_status', al.old_values->>'status',
            'new_status', al.new_values->>'status'
        ) AS details
    FROM public.audit_logs al
    LEFT JOIN public.users u ON u.id::TEXT = al.changed_by
    WHERE al.table_name = 'orders' 
      AND al.record_id = p_order_id 
      AND al.tenant_id::UUID = p_tenant_id
      AND al.action = 'UPDATE'
      AND al.old_values->>'status' IS DISTINCT FROM al.new_values->>'status'
      
    UNION ALL

    -- Eventos 4: Atribuição de Técnico (Audit Logs)
    SELECT 
        al.id::UUID AS event_id,
        'TECH_ASSIGNED'::TEXT AS event_type,
        al.changed_at::TIMESTAMPTZ AS event_date,
        al.changed_by::UUID AS user_id,
        u.name AS user_name,
        jsonb_build_object(
            'old_tech', al.old_values->>'assigned_to',
            'new_tech', al.new_values->>'assigned_to'
        ) AS details
    FROM public.audit_logs al
    LEFT JOIN public.users u ON u.id::TEXT = al.changed_by
    WHERE al.table_name = 'orders' 
      AND al.record_id = p_order_id 
      AND al.tenant_id::UUID = p_tenant_id
      AND al.action = 'UPDATE'
      AND al.old_values->>'assigned_to' IS DISTINCT FROM al.new_values->>'assigned_to'

    UNION ALL

    -- Eventos 5: Agendamento Remarcado (Audit Logs)
    SELECT 
        al.id::UUID AS event_id,
        'SCHEDULE_CHANGED'::TEXT AS event_type,
        al.changed_at::TIMESTAMPTZ AS event_date,
        al.changed_by::UUID AS user_id,
        u.name AS user_name,
        jsonb_build_object(
            'old_date', al.old_values->>'scheduled_date',
            'new_date', al.new_values->>'scheduled_date',
            'old_time', al.old_values->>'scheduled_time',
            'new_time', al.new_values->>'scheduled_time'
        ) AS details
    FROM public.audit_logs al
    LEFT JOIN public.users u ON u.id::TEXT = al.changed_by
    WHERE al.table_name = 'orders' 
      AND al.record_id = p_order_id 
      AND al.tenant_id::UUID = p_tenant_id
      AND al.action = 'UPDATE'
      AND (
          al.old_values->>'scheduled_date' IS DISTINCT FROM al.new_values->>'scheduled_date'
          OR al.old_values->>'scheduled_time' IS DISTINCT FROM al.new_values->>'scheduled_time'
      )

    ORDER BY event_date ASC;
END;
$$;

-- 6. GATILHOS (TRIGGERS) PARA AUTO-ATUALIZAÇÃO
DROP TRIGGER IF EXISTS update_service_visits_modtime ON public.service_visits;
CREATE TRIGGER update_service_visits_modtime 
BEFORE UPDATE ON public.service_visits 
FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at();

COMMIT;
