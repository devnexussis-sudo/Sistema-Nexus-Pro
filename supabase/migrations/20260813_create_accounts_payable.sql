-- Criação da tabela Accounts Payable (Contas a Pagar)
CREATE TABLE IF NOT EXISTS public.accounts_payable (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    supplier_name TEXT,
    category TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    due_date DATE NOT NULL,
    paid_at TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'CANCELLED')),
    payment_method TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id)
);

-- Habilitar RLS
ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS baseadas em tenant_id
CREATE POLICY "Admins can do everything on their tenant's accounts_payable" 
    ON public.accounts_payable
    FOR ALL 
    USING (
        tenant_id = public.get_auth_tenant_id() 
        AND 
        public.get_auth_tenant_id() IS NOT NULL
    );

-- Trigger para updated_at
CREATE TRIGGER handle_updated_at_accounts_payable
    BEFORE UPDATE ON public.accounts_payable
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_accounts_payable_tenant_id ON public.accounts_payable(tenant_id);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_status ON public.accounts_payable(status);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_due_date ON public.accounts_payable(due_date);
