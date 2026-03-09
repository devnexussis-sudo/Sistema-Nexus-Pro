-- =====================================================================================
-- NEXUS PRO - SCHEMA FIX (Tabelas Faltantes)
-- =====================================================================================

-- 1. Tabela de Técnicos (Se o frontend busca por /technicians)
-- Nota: Muitos sistemas usam uma tabela separada para dados específicos do técnico
CREATE TABLE IF NOT EXISTS public.technicians (
    id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    phone text,
    specialties text[], -- Array de especialidades
    active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- 2. Tabela de Contratos (PMOC / Manutenção)
CREATE TABLE IF NOT EXISTS public.contracts (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'ACTIVE',
    start_date date,
    end_date date,
    value numeric(10,2),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3. Sistema de Notificações
CREATE TABLE IF NOT EXISTS public.system_notifications (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    title text NOT NULL,
    content text,
    type text DEFAULT 'INFO',
    target_user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.system_notification_reads (
    notification_id uuid REFERENCES public.system_notifications(id) ON DELETE CASCADE,
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    read_at timestamptz DEFAULT now(),
    PRIMARY KEY (notification_id, user_id)
);

-- 4. Habilitar RLS e criar Políticas
ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_notification_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for technicians" ON public.technicians FOR ALL USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Tenant isolation for contracts" ON public.contracts FOR ALL USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Tenant isolation for notifications" ON public.system_notifications FOR ALL USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Users can see their own reads" ON public.system_notification_reads FOR ALL USING (user_id = auth.uid());

-- 5. Índices
CREATE INDEX IF NOT EXISTS idx_tech_tenant ON public.technicians(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contracts_tenant ON public.contracts(tenant_id);

-- 6. Grant Permissions
GRANT ALL ON TABLE public.technicians TO authenticated;
GRANT ALL ON TABLE public.contracts TO authenticated;
GRANT ALL ON TABLE public.system_notifications TO authenticated;
GRANT ALL ON TABLE public.system_notification_reads TO authenticated;

-- SUCESSO: Agora o PostgREST deve encontrar as tabelas.
