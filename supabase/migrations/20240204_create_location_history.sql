-- =========================================================================
-- MIGRATION: TRACKING HISTORY (Histórico de Rastreamento de Técnicos)
-- Descrição: Cria tabela para armazenar o histórico de localização e 
--            políticas de acesso (RLS).
-- Autor: Nexus Pro AI (MIT Senior Dev)
-- Data: 2026-02-04
-- =========================================================================

-- 1. Tabela de Histórico
CREATE TABLE IF NOT EXISTS public.technician_locations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    latitude FLOAT NOT NULL,
    longitude FLOAT NOT NULL,
    accuracy FLOAT, -- Precisão em metros
    speed FLOAT,    -- Velocidade em m/s
    heading FLOAT,  -- Direção em graus
    battery_level FLOAT, -- Nível de bateria (opcional)
    tenant_id UUID, -- Vinculação com empresa (opcional para multi-tenant)
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index para consultas rápidas por usuário e tempo
CREATE INDEX IF NOT EXISTS idx_tech_loc_user_time ON public.technician_locations(user_id, created_at DESC);

-- 2. Habilitar RLS (Row Level Security)
ALTER TABLE public.technician_locations ENABLE ROW LEVEL SECURITY;

-- 3. Políticas de Segurança (Policies)

-- POLÍTICA DE INSERÇÃO: O técnico só pode inserir sua própria localização
CREATE POLICY "Técnicos podem inserir sua própria localização" 
ON public.technician_locations FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- POLÍTICA DE LEITURA: Admins podem ler tudo, Técnicos apenas o seu
CREATE POLICY "Admins veem tudo, Técnicos veem o seu" 
ON public.technician_locations FOR SELECT 
USING (
    auth.uid() = user_id OR 
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ADMIN', 'MASTER', 'MANAGER'))
);

-- 4. Função RPC Otimizada para Atualização Híbrida (Atualiza Última + Insere Histórico)
CREATE OR REPLACE FUNCTION update_tech_location_v2(
    p_lat FLOAT, 
    p_lng FLOAT,
    p_accuracy FLOAT DEFAULT NULL,
    p_speed FLOAT DEFAULT NULL,
    p_heading FLOAT DEFAULT NULL,
    p_battery FLOAT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_tenant_id UUID;
BEGIN
    -- Busca o tenant_id do usuário atual
    SELECT tenant_id INTO v_tenant_id FROM public.users WHERE id = auth.uid();

    -- 1. Atualiza a tabela 'technicians' com a ÚLTIMA posição (para visualização rápida)
    UPDATE public.technicians 
    SET 
        last_latitude = p_lat,
        last_longitude = p_lng,
        last_seen = now()
    WHERE id = auth.uid();

    -- 2. Insere no Histórico (Breadcrumbs)
    INSERT INTO public.technician_locations (
        user_id, latitude, longitude, accuracy, speed, heading, battery_level, tenant_id
    ) VALUES (
        auth.uid(), p_lat, p_lng, p_accuracy, p_speed, p_heading, p_battery, v_tenant_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
