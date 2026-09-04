-- Migração para Faturamento Agrupado (Faturas / Invoices)
-- Cria as tabelas de faturas consolidadas e seus itens.

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  display_id text,
  customer_name text,
  customer_document text,
  total_amount numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  payment_method text,
  payment_gateway_id text,
  status text NOT NULL DEFAULT 'PENDING',
  notes text,
  created_at timestamp with time zone NULL DEFAULT now(),
  updated_at timestamp with time zone NULL DEFAULT now(),
  paid_at timestamp with time zone NULL,
  created_by uuid,
  CONSTRAINT invoices_pkey PRIMARY KEY (id),
  CONSTRAINT invoices_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
  invoice_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  reference_type text NOT NULL, -- 'ORDER' or 'QUOTE'
  reference_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  CONSTRAINT invoice_items_pkey PRIMARY KEY (id),
  CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE,
  CONSTRAINT invoice_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);

-- Habilitar RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS (Invoices)
CREATE POLICY "Users can view their tenant's invoices" ON public.invoices FOR SELECT USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));
CREATE POLICY "Users can insert their tenant's invoices" ON public.invoices FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));
CREATE POLICY "Users can update their tenant's invoices" ON public.invoices FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));
CREATE POLICY "Users can delete their tenant's invoices" ON public.invoices FOR DELETE USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- Políticas de RLS (Invoice Items)
CREATE POLICY "Users can view their tenant's invoice_items" ON public.invoice_items FOR SELECT USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));
CREATE POLICY "Users can insert their tenant's invoice_items" ON public.invoice_items FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));
CREATE POLICY "Users can update their tenant's invoice_items" ON public.invoice_items FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));
CREATE POLICY "Users can delete their tenant's invoice_items" ON public.invoice_items FOR DELETE USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- Função e Trigger para Auto-incrementar o display_id da Fatura (ex: FAT-0001)
CREATE OR REPLACE FUNCTION public.set_invoice_display_id()
RETURNS TRIGGER AS $$
DECLARE
  next_seq INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(NULLIF(REGEXP_REPLACE(display_id, '[^0-9]', '', 'g'), '') AS INTEGER)), 0) + 1
  INTO next_seq
  FROM public.invoices
  WHERE tenant_id = NEW.tenant_id AND display_id LIKE 'FAT-%';
  
  NEW.display_id := 'FAT-' || LPAD(next_seq::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_invoice_display_id ON public.invoices;
CREATE TRIGGER trigger_set_invoice_display_id
BEFORE INSERT ON public.invoices
FOR EACH ROW
WHEN (NEW.display_id IS NULL OR NEW.display_id = '')
EXECUTE FUNCTION public.set_invoice_display_id();
