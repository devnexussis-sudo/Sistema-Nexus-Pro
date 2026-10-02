-- =========================================================================
-- MIGRATION: REAL-TIME ONLY LOCATION — REMOVE ROUTE HISTORY INSERTS
-- Data: 2026-06-26
-- Descrição: O app agora envia apenas a posição atual do técnico.
--            NÃO gravamos mais histórico de rotas (technician_gps_pings).
--            A tabela de pings é mantida mas não recebe novos dados.
--            O painel web lê apenas last_latitude / last_longitude / last_seen
--            da tabela `technicians` para exibição em tempo real.
-- =========================================================================

-- 1. Substituir update_tech_location_v2 para apenas atualizar posição atual
--    (sem INSERT na tabela de histórico de pings)
CREATE OR REPLACE FUNCTION update_tech_location_v2(
    p_lat      DOUBLE PRECISION,
    p_lng      DOUBLE PRECISION,
    p_accuracy DOUBLE PRECISION DEFAULT NULL,
    p_speed    DOUBLE PRECISION DEFAULT NULL,
    p_heading  DOUBLE PRECISION DEFAULT NULL,
    p_battery  INTEGER          DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_tech_id UUID;
BEGIN
    v_tech_id := auth.uid();
    IF v_tech_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- Apenas atualiza a posição em tempo real — SEM histórico de rotas
    UPDATE public.technicians
    SET
        last_latitude  = p_lat,
        last_longitude = p_lng,
        last_seen      = now(),
        battery_level  = COALESCE(p_battery, battery_level)
    WHERE id = v_tech_id;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Garantir permissões
GRANT EXECUTE ON FUNCTION update_tech_location_v2 TO authenticated;

-- 3. (Opcional) Limpar dados antigos da tabela de pings para liberar espaço
--    Execute manualmente se quiser limpar o histórico acumulado:
-- DELETE FROM public.technician_gps_pings WHERE created_at < now() - INTERVAL '30 days';
-- VACUUM ANALYZE public.technician_gps_pings;
