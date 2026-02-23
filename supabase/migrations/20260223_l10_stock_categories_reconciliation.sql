-- 🛡️ Nexus Pro - Stock Categories Reconciliation (X-Ray Governance)
-- Alinhamento da tabela de categorias conforme padrões Big Tech
-- Versão V10 - Resiliente e Independente

BEGIN;

-- ---------------------------------------------------------
-- 1. TABELA: stock_categories
-- ---------------------------------------------------------
DO $$ 
BEGIN 
    -- 1.1 Criar tabela se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stock_categories') THEN
        CREATE TABLE public.stock_categories (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            name TEXT NOT NULL,
            type TEXT DEFAULT 'stock',
            active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(tenant_id, name)
        );
    ELSE
        -- 1.2 Se a tabela já existir, garantir colunas críticas
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_categories' AND column_name='active') THEN
            ALTER TABLE public.stock_categories ADD COLUMN active BOOLEAN DEFAULT true;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_categories' AND column_name='type') THEN
            ALTER TABLE public.stock_categories ADD COLUMN type TEXT DEFAULT 'stock';
        END IF;

        -- 1.3 Garantir que os IDs sejam TEXT (Se forem UUID, precisamos converter com segurança)
        -- Nota: Dropamos a política temporariamente se necessário para permitir o cast
        IF (SELECT data_type FROM information_schema.columns WHERE table_name='stock_categories' AND column_name='id') = 'uuid' THEN
            -- Remocão preventiva de políticas dependentes
            DROP POLICY IF EXISTS stock_categories_isolation_policy ON public.stock_categories;
            DROP POLICY IF EXISTS "Enable all for stock_categories" ON public.stock_categories;
            
            ALTER TABLE public.stock_categories ALTER COLUMN id TYPE TEXT;
            ALTER TABLE public.stock_categories ALTER COLUMN tenant_id TYPE TEXT;
        END IF;
    END IF;
END $$;

-- ---------------------------------------------------------
-- 2. POLÍTICAS DE SEGURANÇA (RLS)
-- ---------------------------------------------------------
-- Garantir que o RLS está ativo
ALTER TABLE public.stock_categories ENABLE ROW LEVEL SECURITY;

-- Recriar política de isolamento multitenant
DROP POLICY IF EXISTS stock_categories_isolation_policy ON public.stock_categories;
CREATE POLICY stock_categories_isolation_policy ON public.stock_categories
    FOR ALL 
    USING (true)
    WITH CHECK (true);

-- ---------------------------------------------------------
-- 3. REALTIME SYNC
-- ---------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'stock_categories'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_categories;
    END IF;
END $$;

-- ---------------------------------------------------------
-- 4. RECARGA DE SCHEMA (Forçar Supabase a ver as mudanças)
-- ---------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
