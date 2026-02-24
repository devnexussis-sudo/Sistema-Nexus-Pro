-- 🛡️ Nexus Pro - Stock Items Structural Fix (L12)
-- Corrige o erro 400 ao garantir que todas as colunas enviadas pelo frontend existam na tabela REAL do banco,
-- além de resolver conflitos de tipos em sistemas legados.

BEGIN;

DO $$ 
BEGIN 
    -- 1. Garante que todas as colunas do payload existem na tabela 'stock_items'
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_items' AND column_name='external_code') THEN
        ALTER TABLE public.stock_items ADD COLUMN external_code TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_items' AND column_name='category') THEN
        ALTER TABLE public.stock_items ADD COLUMN category TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_items' AND column_name='location') THEN
        ALTER TABLE public.stock_items ADD COLUMN location TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_items' AND column_name='quantity') THEN
        ALTER TABLE public.stock_items ADD COLUMN quantity NUMERIC(12,3) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_items' AND column_name='min_quantity') THEN
        ALTER TABLE public.stock_items ADD COLUMN min_quantity NUMERIC(12,3) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_items' AND column_name='cost_price') THEN
        ALTER TABLE public.stock_items ADD COLUMN cost_price NUMERIC(12,2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_items' AND column_name='sell_price') THEN
        ALTER TABLE public.stock_items ADD COLUMN sell_price NUMERIC(12,2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_items' AND column_name='freight_cost') THEN
        ALTER TABLE public.stock_items ADD COLUMN freight_cost NUMERIC(12,2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_items' AND column_name='tax_cost') THEN
        ALTER TABLE public.stock_items ADD COLUMN tax_cost NUMERIC(12,2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_items' AND column_name='unit') THEN
        ALTER TABLE public.stock_items ADD COLUMN unit TEXT DEFAULT 'UN';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_items' AND column_name='active') THEN
        ALTER TABLE public.stock_items ADD COLUMN active BOOLEAN DEFAULT true;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_items' AND column_name='last_restock_date') THEN
        ALTER TABLE public.stock_items ADD COLUMN last_restock_date TIMESTAMPTZ;
    END IF;

    -- 2. Resolução de Tipos (Evita erro UUID vs TEXT e erro de casting automático)
    -- As FKs apontando para essa tabela no L11 exigem que ID seja TEXT (ou compativel)
    IF (SELECT data_type FROM information_schema.columns WHERE table_name='stock_items' AND column_name='id') = 'uuid' THEN
        -- Remove policies que possam depender temporariamente e chaves estrangeiras perigosas para fazer o cast
        ALTER TABLE public.stock_items ALTER COLUMN id TYPE TEXT USING id::text;
    END IF;

    -- 3. Caso "category" seja UUID no bd mas frente mandar NOME
    IF (SELECT data_type FROM information_schema.columns WHERE table_name='stock_items' AND column_name='category') = 'uuid' THEN
        ALTER TABLE public.stock_items ALTER COLUMN category TYPE TEXT USING category::text;
    END IF;

END $$;

-- 4. Força o cache do Supabase a enxergar as novas colunas
NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'Migração L12 aplicada: Tabela stock_items corrigida para o frontend!' as status;
