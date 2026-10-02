-- Criação da tabela de Categorias
CREATE TABLE IF NOT EXISTS public.payable_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(tenant_id, name)
);

ALTER TABLE public.payable_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can do everything on their tenant's payable_categories" 
    ON public.payable_categories
    FOR ALL 
    USING (
        tenant_id = public.get_auth_tenant_id() 
        AND 
        public.get_auth_tenant_id() IS NOT NULL
    );

-- Alteração na tabela de Contas a Pagar
ALTER TABLE public.accounts_payable 
ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS recurrence_period TEXT CHECK (recurrence_period IN ('MONTHLY', 'WEEKLY', 'YEARLY', NULL)),
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.accounts_payable(id) ON DELETE SET NULL;

-- Inserir algumas categorias padrão para tenants existentes (opcional, apenas para melhorar a UX caso queira puxar por script, 
-- mas como a tabela é isolada por tenant, deixaremos vazia e a UI permitirá cadastro livre, ou faremos via código).
