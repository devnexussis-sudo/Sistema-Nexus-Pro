-- 🛡️ Nexus Pro - Stock Categories Reconciliation (Enterprise Grade)
-- Alinhamento de schema e segurança seguindo rigorosamente a Governança.

BEGIN;

-- 1. RECONCILIAÇÃO DE COLUNAS (Sem quebrar Foreign Keys)
DO $$ 
BEGIN 
    -- 1.1 Coluna ID: Deve ser TEXT para suportar IDs customizados (cat-XXXX) do frontend
    -- Se for UUID, convertemos para TEXT mantendo os dados
    IF (SELECT data_type FROM information_schema.columns WHERE table_name='stock_categories' AND column_name='id') = 'uuid' THEN
        ALTER TABLE public.stock_categories ALTER COLUMN id TYPE TEXT USING id::text;
    END IF;

    -- 1.2 Coluna tenant_id: MANTEMOS como UUID para preservar a Key Constraint com public.tenants
    -- O erro 42804 ocorreu porque o banco exige que a ponta da FK tenha o mesmo tipo da origem.

    -- 1.3 Coluna ACTIVE: Corrige o erro "Could not find active column" visto no seu print
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_categories' AND column_name='active') THEN
        ALTER TABLE public.stock_categories ADD COLUMN active BOOLEAN DEFAULT true;
    END IF;

    -- 1.4 Coluna TYPE: Define se a categoria é de estoque ou serviço
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_categories' AND column_name='type') THEN
        ALTER TABLE public.stock_categories ADD COLUMN type TEXT DEFAULT 'stock';
    END IF;
END $$;

-- 2. GOVERNANÇA DE SEGURANÇA (RLS)
-- Garante isolamento absoluto entre empresas
ALTER TABLE public.stock_categories ENABLE ROW LEVEL SECURITY;

-- Recria política usando casting seguro para evitar conflito de tipos (UUID = TEXT)
DROP POLICY IF EXISTS stock_categories_isolation_policy ON public.stock_categories;
CREATE POLICY stock_categories_isolation_policy ON public.stock_categories
    FOR ALL 
    USING (tenant_id::text = (auth.jwt() ->> 'tenant_id'))
    WITH CHECK (tenant_id::text = (auth.jwt() ->> 'tenant_id'));

-- 3. RECARGA DE SCHEMA
-- Força o PostgREST a ler a nova estrutura imediatamente
NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'Migração L10 aplicada com sucesso seguindo padrões Big Tech!' as status;
