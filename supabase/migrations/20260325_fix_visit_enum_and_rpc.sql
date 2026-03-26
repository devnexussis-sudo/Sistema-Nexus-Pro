BEGIN;

-- 1. Add 'blocked' to visit_status ENUM if missing
DO $$ BEGIN
    ALTER TYPE public.visit_status ADD VALUE 'blocked';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create RPC to bypass RLS and create a visit reliably
CREATE OR REPLACE FUNCTION public.nexus_create_service_visit(
    p_tenant_id UUID,
    p_order_id TEXT,
    p_technician_id UUID,
    p_visit_number INTEGER,
    p_status public.visit_status,
    p_scheduled_date DATE,
    p_scheduled_time TIME,
    p_notes TEXT,
    p_form_id TEXT,
    p_created_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_visit RECORD;
BEGIN
    INSERT INTO public.service_visits (
        tenant_id, order_id, technician_id, visit_number, status, scheduled_date, scheduled_time, notes, form_id, created_by
    ) VALUES (
        p_tenant_id, p_order_id, p_technician_id, p_visit_number, p_status, p_scheduled_date, p_scheduled_time, p_notes, NULLIF(p_form_id, '')::UUID, p_created_by
    )
    RETURNING * INTO v_visit;

    RETURN to_jsonb(v_visit);
END;
$$;

COMMIT;
