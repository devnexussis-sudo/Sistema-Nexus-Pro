CREATE TABLE IF NOT EXISTS public.cash_flow (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
    category TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    description TEXT NOT NULL,
    reference_id UUID,
    reference_type TEXT,
    payment_method TEXT,
    entry_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    customer_id UUID,
    technician_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.cash_flow ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can do everything on their tenant's cash_flow" 
    ON public.cash_flow
    FOR ALL 
    USING (
        tenant_id = public.get_auth_tenant_id() 
        AND 
        public.get_auth_tenant_id() IS NOT NULL
    );

CREATE INDEX IF NOT EXISTS idx_cash_flow_tenant_id ON public.cash_flow(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cash_flow_entry_date ON public.cash_flow(entry_date);
CREATE INDEX IF NOT EXISTS idx_cash_flow_reference ON public.cash_flow(reference_id, reference_type);
