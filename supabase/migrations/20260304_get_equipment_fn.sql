-- ════════════════════════════════════════════════════════════════════
-- Nexus Pro — Função SECURITY DEFINER para leitura de equipamentos
-- Resolve o RLS que bloqueia SELECT em service_order_equipments
-- ════════════════════════════════════════════════════════════════════

BEGIN;

DROP FUNCTION IF EXISTS public.nexus_get_order_equipments(TEXT);

CREATE OR REPLACE FUNCTION public.nexus_get_order_equipments(
    p_order_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_result    JSONB;
BEGIN
    -- Resolve tenant_id pela própria OS (sempre confiável, sem JWT)
    SELECT tenant_id INTO v_tenant_id
    FROM public.orders
    WHERE id = p_order_id
    LIMIT 1;

    IF v_tenant_id IS NULL THEN
        RETURN '[]'::JSONB;
    END IF;

    SELECT jsonb_agg(
        to_jsonb(e) ORDER BY e.sort_order ASC, e.created_at ASC
    )
    INTO v_result
    FROM public.service_order_equipments e
    WHERE e.order_id   = p_order_id
      AND e.tenant_id  = v_tenant_id
      AND e.deleted_at IS NULL;

    RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;

GRANT EXECUTE ON FUNCTION public.nexus_get_order_equipments(TEXT)
    TO authenticated, anon;

NOTIFY pgrst, 'reload schema';

COMMIT;
