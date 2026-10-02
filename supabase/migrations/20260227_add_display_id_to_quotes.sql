-- ============================================================
-- Nexus Pro - Migration: Adiciona display_id na tabela quotes
-- Autor: Engenharia Nexus | Data: 2026-02-27
-- Motivo: A PK `id` do banco é UUID (gerado pelo Postgres).
--         O Identificador Soberano ORC-... precisa de coluna
--         própria para ser exibido na interface.
-- ============================================================

BEGIN;

DO $$
BEGIN
    -- Adiciona coluna display_id se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'quotes' AND column_name = 'display_id'
    ) THEN
        ALTER TABLE public.quotes ADD COLUMN display_id TEXT;
        COMMENT ON COLUMN public.quotes.display_id IS
            'Identificador Soberano Nexus (ex: ORC-2926001). '
            'Gerado pela aplicação no momento da criação. '
            'Separado da PK UUID para compatibilidade retroativa.';
    END IF;

    -- Cria índice para busca rápida por display_id
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'quotes' AND indexname = 'idx_quotes_display_id'
    ) THEN
        CREATE INDEX idx_quotes_display_id ON public.quotes (display_id);
    END IF;
END $$;

COMMIT;
