-- ═══════════════════════════════════════════════════════════════════
-- DUNO — Fix definitivo: RLS service_visits para admins
-- CAUSA RAIZ: auth.jwt() -> 'user_metadata' ->> 'tenantId' retorna NULL
-- para admins do Supabase, causando tenant_id = NULL que é sempre FALSE.
-- SOLUÇÃO: usar EXISTS na tabela tenants via auth.uid() como fallback.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- Remove políticas problemáticas
DROP POLICY IF EXISTS "Visits SELECT" ON public.service_visits;
DROP POLICY IF EXISTS "Visits ALL" ON public.service_visits;
DROP POLICY IF EXISTS "visits_select_policy" ON public.service_visits;
DROP POLICY IF EXISTS "visits_all_policy" ON public.service_visits;

-- Helper: resolve tenant_id do usuário autenticado via múltiplos caminhos
-- Funciona para admin Supabase (sem user_metadata custom) e técnicos (com user_metadata)
CREATE OR REPLACE FUNCTION public._resolve_user_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT COALESCE(
        -- 1. user_metadata.tenantId (técnicos/admins com claim customizado)
        (auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid,
        -- 2. user_metadata.tenant_id (variante snake_case)
        (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid,
        -- 3. app_metadata.tenant_id (configurado via Supabase Dashboard)
        (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid,
        -- 4. Busca pelo user na tabela users (fallback para admins nativos Supabase)
        (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid() LIMIT 1)
    )
$$;

GRANT EXECUTE ON FUNCTION public._resolve_user_tenant_id() TO authenticated, anon;

-- ─── LEITURA ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "visits_select_v2" ON public.service_visits;
CREATE POLICY "visits_select_v2" ON public.service_visits
    FOR SELECT USING (
        tenant_id = public._resolve_user_tenant_id()
        OR (
            -- Técnico pode ver as OSs onde é responsável
            COALESCE((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'technician'
            AND EXISTS (
                SELECT 1 FROM public.orders o
                WHERE o.id = service_visits.order_id
                  AND o.assigned_to = auth.uid()
            )
        )
    );

-- ─── ESCRITA (INSERT / UPDATE / DELETE) ───────────────────────────
DROP POLICY IF EXISTS "visits_write_v2" ON public.service_visits;
CREATE POLICY "visits_write_v2" ON public.service_visits
    FOR ALL USING (
        -- Admin/Manager: tenant_id resolvido via helper multi-fallback
        (
            COALESCE((auth.jwt() -> 'user_metadata' ->> 'role'), 'admin') IN ('admin', 'manager', 'operator')
            AND tenant_id = public._resolve_user_tenant_id()
        )
        OR
        -- Técnico: só pode escrever na visita onde é o responsável
        (
            COALESCE((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'technician'
            AND technician_id = auth.uid()
        )
    );

-- ─── Atualiza função de update de visita (RPC simplificada) ───────
DROP FUNCTION IF EXISTS public.duno_update_visit_schedule(TEXT, TEXT, TEXT, TEXT, TEXT);

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
    -- Resolve tenant_id via orders (não depende de JWT)
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

    -- Atualiza a visita
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

    -- Sincroniza a OS — orders.scheduled_date e scheduled_time são TEXT
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

    -- Retorna a visita atualizada
    SELECT to_jsonb(sv) INTO v_result
    FROM public.service_visits sv
    WHERE sv.id = p_visit_id::UUID AND sv.tenant_id = v_tenant_id;

    RETURN jsonb_build_object('ok', true, 'visit', v_result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.duno_update_visit_schedule(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
