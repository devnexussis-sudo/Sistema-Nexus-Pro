-- 🛡️ Nexus Pro - Stock Items Structural Fix (L12) - Governance Compliant
-- Corrige o erro 400 ao garantir que todas as colunas enviadas pelo frontend existam na tabela REAL do banco,
-- além de resolver conflitos de tipos em sistemas legados, respeitando as Foreign Keys.

BEGIN;

DO $$ 
BEGIN 
    -- 1. Garante as colunas faltantes que causam o Erro 400 ('freight_cost', 'tax_cost', etc)
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

    -- 2. RESOLUÇÃO DE TIPOS ENRAIZADOS (X-Ray Foreign Key Rescue)
    -- O erro 42804 ocorre porque `stock_movements` (e possivelmente `tech_stock`)
    -- ainda usam 'uuid' e apontam para `stock_items(id)`.
    
    IF (SELECT data_type FROM information_schema.columns WHERE table_name='stock_items' AND column_name='id') = 'uuid' THEN
        
        -- 2.1 Remover vínculos das chaves estrangeiras que dependem do 'id' (stock_movements)
        ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_item_id_fkey;
        -- Em algumas versões recentes do banco, a coluna pode se chamar stock_item_id
        ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_stock_item_id_fkey;
        
        -- Da tabela tech_stock
        ALTER TABLE public.tech_stock DROP CONSTRAINT IF EXISTS tech_stock_stock_item_id_fkey;

        -- 2.2 Alterar os tipos nas tabelas dependentes (Filhas) primeiro ou ao mesmo tempo
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_movements' AND column_name='item_id') THEN
            ALTER TABLE public.stock_movements ALTER COLUMN item_id TYPE TEXT USING item_id::text;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_movements' AND column_name='stock_item_id') THEN
            ALTER TABLE public.stock_movements ALTER COLUMN stock_item_id TYPE TEXT USING stock_item_id::text;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tech_stock' AND column_name='stock_item_id') THEN
            ALTER TABLE public.tech_stock ALTER COLUMN stock_item_id TYPE TEXT USING stock_item_id::text;
        END IF;

        -- 2.3 Alterar o tipo na tabela pai
        ALTER TABLE public.stock_items ALTER COLUMN id TYPE TEXT USING id::text;

        -- 2.4 Recriar as dependências (Foreign Keys) de forma limpa apontando para o TEXT
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_movements' AND column_name='item_id') THEN
            ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.stock_items(id) ON DELETE CASCADE;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_movements' AND column_name='stock_item_id') THEN
            ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id) ON DELETE CASCADE;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tech_stock' AND column_name='stock_item_id') THEN
            ALTER TABLE public.tech_stock ADD CONSTRAINT tech_stock_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id) ON DELETE CASCADE;
        END IF;
    END IF;

    -- 3. Caso a coluna 'category' seja id mas precisemos do text
    IF (SELECT data_type FROM information_schema.columns WHERE table_name='stock_items' AND column_name='category') = 'uuid' THEN
        ALTER TABLE public.stock_items ALTER COLUMN category TYPE TEXT USING category::text;
    END IF;

END $$;

-- 4. Força o cache do Supabase a enxergar as novas definições
NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'Migração L12 (X-Ray Fix) aplicada: Dependências e colunas corrigidas com sucesso!' as status;
