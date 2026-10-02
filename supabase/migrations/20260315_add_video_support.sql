-- =====================================================
-- Migration: Adicionar suporte a vídeo nas ordens de serviço
-- =====================================================

-- 1. Adicionar colunas de vídeo na tabela orders (se não existirem)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'video_url') THEN
        ALTER TABLE orders ADD COLUMN video_url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'video_size_mb') THEN
        ALTER TABLE orders ADD COLUMN video_size_mb NUMERIC(6,2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'video_status') THEN
        ALTER TABLE orders ADD COLUMN video_status TEXT DEFAULT 'none';
        -- Valores possíveis: 'none', 'uploaded', 'processing', 'optimized', 'error'
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'video_optimized_url') THEN
        ALTER TABLE orders ADD COLUMN video_optimized_url TEXT;
    END IF;
END $$;

-- 2. Tabela de fila de processamento de vídeo
CREATE TABLE IF NOT EXISTS video_processing_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL UNIQUE,
    tenant_id TEXT,
    original_url TEXT NOT NULL,
    original_size_mb NUMERIC(8,2),
    optimized_url TEXT,
    optimized_size_mb NUMERIC(8,2),
    codec_target TEXT DEFAULT 'av1',
    status TEXT DEFAULT 'pending',  -- pending, processing, done, error
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    processed_at TIMESTAMPTZ
);

-- Índice para buscar pendentes rapidamente
CREATE INDEX IF NOT EXISTS idx_video_queue_status ON video_processing_queue(status);
CREATE INDEX IF NOT EXISTS idx_video_queue_tenant ON video_processing_queue(tenant_id);

-- 3. RLS (Row Level Security) — desabilitado para esta tabela (processamento interno)
ALTER TABLE video_processing_queue ENABLE ROW LEVEL SECURITY;

-- Policy: service role pode tudo
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'video_processing_queue' 
        AND policyname = 'Service role full access'
    ) THEN
        CREATE POLICY "Service role full access"
            ON video_processing_queue
            FOR ALL
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

COMMENT ON TABLE video_processing_queue IS 'Fila de processamento de vídeos para compressão AV1. Preenchida pela Edge Function process-video, consumida por um worker externo.';
