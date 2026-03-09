-- Migration: Technician Location History & Daily Reset (FIXED VERSION)
-- Usa DROP IF EXISTS para evitar erros se rodar múltiplas vezes

-- 📍 Tabela de Histórico de Localização dos Técnicos
CREATE TABLE IF NOT EXISTS public.technician_location_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    technician_id UUID NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Campos úteis para análise
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    hour INTEGER NOT NULL DEFAULT EXTRACT(HOUR FROM NOW()),
    -- Metadados
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_tech_location_history_tech_id ON public.technician_location_history(technician_id);
CREATE INDEX IF NOT EXISTS idx_tech_location_history_tenant_id ON public.technician_location_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tech_location_history_date ON public.technician_location_history(date);
CREATE INDEX IF NOT EXISTS idx_tech_location_history_recorded_at ON public.technician_location_history(recorded_at);

-- RLS Policies
ALTER TABLE public.technician_location_history ENABLE ROW LEVEL SECURITY;

-- ✅ CORRIGIDO: Remove policy se existir antes de criar
DROP POLICY IF EXISTS "Users can view their tenant location history" ON public.technician_location_history;

CREATE POLICY "Users can view their tenant location history" ON public.technician_location_history
FOR SELECT
USING (
    auth.role() = 'authenticated' AND
    tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid
);

-- 🔄 Função para salvar histórico quando técnico atualiza localização
CREATE OR REPLACE FUNCTION save_technician_location_history()
RETURNS TRIGGER AS $$
BEGIN
    -- Só salva se realmente mudou a posição (evita spam)
    IF (NEW.last_latitude IS NOT NULL AND NEW.last_longitude IS NOT NULL) AND
       (OLD.last_latitude IS DISTINCT FROM NEW.last_latitude OR 
        OLD.last_longitude IS DISTINCT FROM NEW.last_longitude) THEN
        
        INSERT INTO public.technician_location_history (
            technician_id,
            tenant_id,
            latitude,
            longitude,
            recorded_at
        ) VALUES (
            NEW.id,
            NEW.tenant_id,
            NEW.last_latitude,
            NEW.last_longitude,
            NOW()
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para salvar histórico automaticamente
DROP TRIGGER IF EXISTS trigger_save_tech_location_history ON public.technicians;
CREATE TRIGGER trigger_save_tech_location_history
AFTER UPDATE OF last_latitude, last_longitude ON public.technicians
FOR EACH ROW
EXECUTE FUNCTION save_technician_location_history();

-- 🌙 Função para resetar posições dos técnicos à meia-noite
CREATE OR REPLACE FUNCTION reset_technician_positions_daily()
RETURNS void AS $$
BEGIN
    -- Limpa as posições de todos os técnicos
    UPDATE public.technicians
    SET 
        last_latitude = NULL,
        last_longitude = NULL,
        last_seen = NULL
    WHERE last_seen < CURRENT_DATE; -- Só reseta se foi visto antes de hoje
    
    RAISE NOTICE '🌙 [Nexus] Posições dos técnicos resetadas para novo dia';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 📊 Função para obter relatório diário de movimentação
CREATE OR REPLACE FUNCTION get_daily_tech_movement_report(
    p_tenant_id UUID,
    p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    technician_id UUID,
    technician_name TEXT,
    technician_avatar TEXT,
    total_pings BIGINT,
    first_ping TIMESTAMPTZ,
    last_ping TIMESTAMPTZ,
    hours_active NUMERIC,
    locations_visited BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id AS technician_id,
        t.name AS technician_name,
        t.avatar AS technician_avatar,
        COUNT(h.id) AS total_pings,
        MIN(h.recorded_at) AS first_ping,
        MAX(h.recorded_at) AS last_ping,
        ROUND(EXTRACT(EPOCH FROM (MAX(h.recorded_at) - MIN(h.recorded_at))) / 3600.0, 2) AS hours_active,
        COUNT(DISTINCT (h.latitude::TEXT || ',' || h.longitude::TEXT)) AS locations_visited
    FROM public.technicians t
    LEFT JOIN public.technician_location_history h ON h.technician_id = t.id AND h.date = p_date
    WHERE t.tenant_id = p_tenant_id
    GROUP BY t.id, t.name, t.avatar
    HAVING COUNT(h.id) > 0
    ORDER BY total_pings DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permissões
GRANT EXECUTE ON FUNCTION get_daily_tech_movement_report TO authenticated;

-- Comentários
COMMENT ON TABLE public.technician_location_history IS 'Histórico de localizações dos técnicos para análise e auditoria';
COMMENT ON FUNCTION reset_technician_positions_daily IS 'Reseta posições dos técnicos à meia-noite para começar novo dia limpo';
COMMENT ON FUNCTION get_daily_tech_movement_report IS 'Gera relatório diário de movimentação dos técnicos';

-- ✅ Sucesso!
SELECT '✅ Histórico de localização configurado com sucesso!' as status;
