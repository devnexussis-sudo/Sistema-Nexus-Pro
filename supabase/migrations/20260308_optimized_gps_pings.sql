-- =========================================================================
-- MIGRATION: LEAN GPS TELEMETRY SYSTEM
-- Descrição: Cria tabela ultra-leve para pings de GPS e otimiza RPC.
--            Focado em performance e redução de carga no banco.
-- =========================================================================

-- 1. Tabela enxuta para logs de GPS
CREATE TABLE IF NOT EXISTS public.technician_gps_pings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    technician_id UUID DEFAULT auth.uid() NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexação estratégica para performance de leitura (Admin Maps)
CREATE INDEX IF NOT EXISTS idx_tech_gps_pings_tech_time ON public.technician_gps_pings(technician_id, created_at DESC);

-- 2. Habilitar RLS
ALTER TABLE public.technician_gps_pings ENABLE ROW LEVEL SECURITY;

-- 3. Políticas Cirúrgicas
DROP POLICY IF EXISTS "Allow technician insert" ON public.technician_gps_pings;
CREATE POLICY "Allow technician insert" ON public.technician_gps_pings
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = technician_id);

DROP POLICY IF EXISTS "Admins can see gps pings" ON public.technician_gps_pings;
CREATE POLICY "Admins can see gps pings" ON public.technician_gps_pings
    FOR SELECT TO authenticated USING (
        auth.uid() = technician_id OR 
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ADMIN', 'MANAGER', 'OPERATOR'))
    );

-- 4. RPC Otimizado (Big Tech Scale)
-- Atualiza a última posição no técnico e registra o ping na tabela enxuta
CREATE OR REPLACE FUNCTION update_tech_location_v2(
    p_lat DOUBLE PRECISION, 
    p_lng DOUBLE PRECISION,
    p_accuracy DOUBLE PRECISION DEFAULT NULL,
    p_speed DOUBLE PRECISION DEFAULT NULL,
    p_heading DOUBLE PRECISION DEFAULT NULL,
    p_battery INTEGER DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_tech_id UUID;
BEGIN
    v_tech_id := auth.uid();
    IF v_tech_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- Update técnico (Ponteiro de tempo real)
    UPDATE public.technicians 
    SET 
        last_latitude = p_lat,
        last_longitude = p_lng,
        last_seen = now(),
        battery_level = p_battery
    WHERE id = v_tech_id;

    -- Insert no log (Histórico enxuto)
    INSERT INTO public.technician_gps_pings (
        technician_id, latitude, longitude
    ) VALUES (
        v_tech_id, p_lat, p_lng
    );

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Heartbeat Ultra-Light (Presença sem log de movimento)
CREATE OR REPLACE FUNCTION tech_heartbeat(
    p_battery INTEGER DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_tech_id UUID;
BEGIN
    v_tech_id := auth.uid();
    IF v_tech_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    UPDATE public.technicians 
    SET 
        last_seen = now(),
        battery_level = COALESCE(p_battery, battery_level)
    WHERE id = v_tech_id;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Garantir permissões
GRANT EXECUTE ON FUNCTION update_tech_location_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION tech_heartbeat TO authenticated;
GRANT INSERT, SELECT ON TABLE public.technician_gps_pings TO authenticated;
