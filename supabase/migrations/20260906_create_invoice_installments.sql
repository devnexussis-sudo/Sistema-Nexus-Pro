-- Migração para Criação da Tabela de Parcelamentos de Fatura (Boletos)
-- Atrela parcelas de boletos individuais à Fatura (invoices) principal.

CREATE TABLE IF NOT EXISTS public.invoice_installments (
  id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
  invoice_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  installment_number integer NOT NULL,
  total_installments integer NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  payment_method text NOT NULL DEFAULT 'boleto',
  gateway_payment_id text,
  gateway_ticket_url text,
  paid_at timestamp with time zone NULL,
  created_at timestamp with time zone NULL DEFAULT now(),
  updated_at timestamp with time zone NULL DEFAULT now(),
  CONSTRAINT invoice_installments_pkey PRIMARY KEY (id),
  CONSTRAINT invoice_installments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE,
  CONSTRAINT invoice_installments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);

-- Habilitar RLS
ALTER TABLE public.invoice_installments ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
CREATE POLICY "Users can view their tenant's invoice_installments" ON public.invoice_installments FOR SELECT USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));
CREATE POLICY "Users can insert their tenant's invoice_installments" ON public.invoice_installments FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));
CREATE POLICY "Users can update their tenant's invoice_installments" ON public.invoice_installments FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));
CREATE POLICY "Users can delete their tenant's invoice_installments" ON public.invoice_installments FOR DELETE USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- Criar índice para buscas rápidas pelo ID do gateway (para webhooks)
CREATE INDEX IF NOT EXISTS idx_invoice_installments_gateway_id ON public.invoice_installments(gateway_payment_id);
