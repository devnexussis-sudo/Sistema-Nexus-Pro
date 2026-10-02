-- =========================================================================
-- MIGRATION: GPS PINGS OPTIMIZATION
-- =========================================================================

-- 1. Modificar a função de expurgo de GPS para 7 dias (antes era 30)
CREATE OR REPLACE FUNCTION public.prune_old_gps_pings()
RETURNS void AS $$
BEGIN
    DELETE FROM public.technician_gps_pings
    WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Excluir o índice de busca por histórico (função removida do painel)
DROP INDEX IF EXISTS public.idx_tech_gps_pings_tech_time;
