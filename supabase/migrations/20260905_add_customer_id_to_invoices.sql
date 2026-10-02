-- Adiciona a coluna customer_id na tabela invoices
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;

-- Cria índice para melhorar a performance nas buscas por cliente
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON public.invoices(customer_id);

-- Recriando as políticas RLS (Row Level Security) para amarrar de vez no tenant_id com máxima performance
DROP POLICY IF EXISTS "Users can view their tenant's invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can insert their tenant's invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can update their tenant's invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can delete their tenant's invoices" ON public.invoices;

-- Políticas Refatoradas (Usando a função otimizada public.get_auth_tenant_id() ou validação direta)
-- Garantindo segurança e isolamento por empresa (Multi-Tenant)
CREATE POLICY "tenant_isolation_invoices_select" ON public.invoices
FOR SELECT USING (tenant_id = public.get_auth_tenant_id());

CREATE POLICY "tenant_isolation_invoices_insert" ON public.invoices
FOR INSERT WITH CHECK (tenant_id = public.get_auth_tenant_id());

CREATE POLICY "tenant_isolation_invoices_update" ON public.invoices
FOR UPDATE USING (tenant_id = public.get_auth_tenant_id());

CREATE POLICY "tenant_isolation_invoices_delete" ON public.invoices
FOR DELETE USING (tenant_id = public.get_auth_tenant_id());
