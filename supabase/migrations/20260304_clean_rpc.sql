-- =====================================================================================
-- NEXUS PRO - FIX DEFINITIVO (BIG TECH TIER)
-- Limpeza profunda de funções sobrecarregadas (overloaded functions) associadas 
-- à atualização do agendamento de visitas, evitando resolução ambígua pelo PostgREST 
-- e erros em colunas inexistentes criadas em experimentações anteriores.
-- =====================================================================================

BEGIN;

-- 1. DROP ROBUSTO: Remove TODAS as versões da função 'duno_update_visit_schedule'
-- Isso garante que nenhuma assinatura legada com 6 parâmetros (ou outras) permaneça no banco,
-- impedindo o PostgREST de rotear para a função velha que faz referência a 'scheduled_end_time'.
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT oid::regprocedure AS obj_name
        FROM pg_proc
        WHERE proname = 'duno_update_visit_schedule' AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || rec.obj_name || ' CASCADE';
        RAISE NOTICE 'Dropped function: %', rec.obj_name;
    END LOOP;
END
$$;

-- 2. DROP DE TRIGGERS RESIDUAIS (se criados anteriormente e não mais usados)
-- O trigger tentava sincronizar para orders e pode estar causando conflitos
DROP TRIGGER IF EXISTS trg_sync_order_from_visit ON public.service_visits;
DROP FUNCTION IF EXISTS public.sync_order_from_visit() CASCADE;

-- 3. RECRIAÇÃO ENXUTA (5 PARÂMETROS - A ÚNICA FONTE DA VERDADE)
-- Função otimizada sem referências a colunas inexistentes ou lixo.
CREATE OR REPLACE FUNCTION public.duno_update_visit_schedule(
    p_visit_id       TEXT,
    p_order_id       TEXT,
    p_scheduled_date TEXT,
    p_scheduled_time TEXT DEFAULT NULL,
    p_technician_id  TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_current   RECORD;
    v_result    JSONB;
BEGIN
    -- Resolve tenant_id via orders (não depende de JWT, robusto para RLS)
    SELECT tenant_id INTO v_tenant_id
    FROM public.orders
    WHERE id = p_order_id
    LIMIT 1;

    IF v_tenant_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'ORDER_NOT_FOUND');
    END IF;

    -- Snapshot da visita atual
    SELECT * INTO v_current
    FROM public.service_visits
    WHERE id = p_visit_id::UUID AND tenant_id = v_tenant_id
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'VISIT_NOT_FOUND');
    END IF;

    IF v_current.is_locked = TRUE OR v_current.status::TEXT = 'completed' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'VISIT_LOCKED');
    END IF;

    -- Atualiza a visita (SEM scheduled_end_time)
    UPDATE public.service_visits
    SET
        scheduled_date = p_scheduled_date::DATE,
        scheduled_time = CASE
                            WHEN p_scheduled_time IS NULL OR trim(p_scheduled_time) = ''
                            THEN NULL
                            ELSE p_scheduled_time::TIME
                         END,
        technician_id = CASE
                            WHEN p_technician_id IS NOT NULL AND p_technician_id <> ''
                            THEN p_technician_id::UUID
                            ELSE technician_id
                         END,
        updated_at = NOW()
    WHERE id = p_visit_id::UUID AND tenant_id = v_tenant_id;

    -- Sincroniza a tabela ORDERS atomicamente
    SET LOCAL session_replication_role = replica;
    UPDATE public.orders
    SET
        scheduled_date = p_scheduled_date,
        scheduled_time = CASE
                            WHEN p_scheduled_time IS NULL OR trim(p_scheduled_time) = ''
                            THEN NULL
                            ELSE p_scheduled_time
                         END,
        assigned_to = CASE
                            WHEN p_technician_id IS NOT NULL AND p_technician_id <> ''
                            THEN p_technician_id::UUID
                            ELSE assigned_to
                         END,
        updated_at = NOW()
    WHERE id = p_order_id AND tenant_id = v_tenant_id;
    SET LOCAL session_replication_role = DEFAULT;

    -- Retorna a visita atualizada nova
    SELECT to_jsonb(sv) INTO v_result
    FROM public.service_visits sv
    WHERE sv.id = p_visit_id::UUID AND sv.tenant_id = v_tenant_id;

    RETURN jsonb_build_object('ok', true, 'visit', v_result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.duno_update_visit_schedule(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Força o PostgREST a limpar o cache de schema para enxergar apenas a função nova
NOTIFY pgrst, 'reload schema';

COMMIT;
