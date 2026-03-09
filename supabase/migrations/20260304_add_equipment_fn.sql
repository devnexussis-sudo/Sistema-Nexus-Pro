-- ════════════════════════════════════════════════════════════════════
-- Nexus Pro — Função SECURITY DEFINER para insert seguro em
-- service_order_equipments, sem depender de RLS claim JWT.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- Remove versão antiga se existir
DROP FUNCTION IF EXISTS public.nexus_add_equipment_to_order(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER
);

-- ─────────────────────────────────────────────────────────────────
-- Função principal: insere 1 equipamento em service_order_equipments
-- Resolve tenant_id de: JWT → current_setting → FK de orders
-- SECURITY DEFINER: roda como postgres (bypassa RLS)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nexus_add_equipment_to_order(
    p_order_id        TEXT,
    p_equipment_id    TEXT,
    p_equipment_name  TEXT,
    p_equipment_model TEXT,
    p_equipment_serial TEXT,
    p_equipment_family TEXT,
    p_form_id         TEXT,
    p_sort_order      INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id   UUID;
    v_new_id      UUID;
    v_result      JSONB;
BEGIN
    -- 1. Tenta resolver tenant_id pelo JWT do usuário autenticado
    BEGIN
        v_tenant_id := (auth.jwt() ->> 'tenant_id')::UUID;
    EXCEPTION WHEN others THEN
        v_tenant_id := NULL;
    END;

    -- 2. Fallback: current_setting (para edge functions e server-side)
    IF v_tenant_id IS NULL THEN
        BEGIN
            v_tenant_id := current_setting('app.tenant_id', true)::UUID;
        EXCEPTION WHEN others THEN
            v_tenant_id := NULL;
        END;
    END IF;

    -- 3. Fallback final: busca tenant_id direto da OS (sempre confiável)
    IF v_tenant_id IS NULL THEN
        SELECT tenant_id INTO v_tenant_id
        FROM public.orders
        WHERE id = p_order_id
        LIMIT 1;
    END IF;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'TENANT_NOT_FOUND: não foi possível resolver tenant_id para order_id=%', p_order_id;
    END IF;

    -- 4. Gera UUID único
    v_new_id := gen_random_uuid();

    -- 5. Insert direto (SECURITY DEFINER bypassa RLS)
    INSERT INTO public.service_order_equipments (
        id,
        tenant_id,
        order_id,
        equipment_id,
        equipment_name,
        equipment_model,
        equipment_serial,
        equipment_family,
        form_id,
        status,
        sort_order,
        deleted_at
    ) VALUES (
        v_new_id,
        v_tenant_id,
        p_order_id,
        NULLIF(p_equipment_id, ''),
        p_equipment_name,
        NULLIF(p_equipment_model, ''),
        NULLIF(p_equipment_serial, ''),
        NULLIF(p_equipment_family, ''),
        NULLIF(p_form_id, ''),
        'PENDING',
        p_sort_order,
        NULL
    );

    -- 6. Retorna o registro inserido como JSON
    SELECT to_jsonb(e) INTO v_result
    FROM public.service_order_equipments e
    WHERE e.id = v_new_id;

    RETURN v_result;
END;
$$;

-- Garante que usuários autenticados podem chamar a função
GRANT EXECUTE ON FUNCTION public.nexus_add_equipment_to_order(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nexus_add_equipment_to_order(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER
) TO anon;

NOTIFY pgrst, 'reload schema';

COMMIT;
