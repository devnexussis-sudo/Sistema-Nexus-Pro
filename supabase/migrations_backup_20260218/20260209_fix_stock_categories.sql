-- =====================================================================================
-- NEXUS PRO - FIX MISSING LOOKUP TABLES
-- =====================================================================================
-- Data: 2026-02-09
-- Descrição: Cria tabela stock_categories faltante para corrigir erro 404 no módulo de estoque.

-- 1. Criar tabela de CATEGORIAS DE ESTOQUE
CREATE TABLE IF NOT EXISTS public.stock_categories (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    created_at timestamptz DEFAULT now()
);

-- 2. Habilitar RLS
ALTER TABLE public.stock_categories ENABLE ROW LEVEL SECURITY;

-- 3. Criar Política de Isolamento
CREATE POLICY "Tenant isolation for stock_categories" ON public.stock_categories
    FOR ALL USING (tenant_id = public.get_user_tenant_id());

-- 4. Dar Permissões
GRANT ALL ON TABLE public.stock_categories TO authenticated;

-- 5. Inserir Categorias Padrão (Seed)
DO $$
DECLARE
    v_tenant_id uuid;
BEGIN
    -- Pega o ID do tenant 'Nexus Corp' (ajuste conforme necessário ou deixe dinâmico no app)
    SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = 'nexus-corp' LIMIT 1;
    
    IF v_tenant_id IS NOT NULL THEN
        INSERT INTO public.stock_categories (tenant_id, name, description)
        VALUES 
            (v_tenant_id, 'Peças', 'Peças de reposição'),
            (v_tenant_id, 'Ferramentas', 'Ferramentas de trabalho'),
            (v_tenant_id, 'Insumos', 'Materiais de consumo (cabos, conectores)')
        ON CONFLICT DO NOTHING; -- Evita erro se rodar 2x
    END IF;
END $$;

-- 6. Recarregar Schema Cache
NOTIFY pgrst, 'reload schema';
