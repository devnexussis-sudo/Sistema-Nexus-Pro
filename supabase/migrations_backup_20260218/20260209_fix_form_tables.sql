-- =====================================================================================
-- NEXUS PRO - FIX FORM MODULE TABLES
-- =====================================================================================
-- Data: 2026-02-09
-- Descrição: Cria as tabelas necessárias para o módulo de Formulários e Regras de Ativação.

-- 1. Tipos de Serviço (Ex: Instalação, Reparo)
CREATE TABLE IF NOT EXISTS public.service_types (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- 2. Templates de Formulário (JSON Schema)
CREATE TABLE IF NOT EXISTS public.form_templates (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text,
    schema jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3. Regras de Ativação (Lógica condicional para formulários)
CREATE TABLE IF NOT EXISTS public.activation_rules (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    form_template_id uuid REFERENCES public.form_templates(id) ON DELETE CASCADE,
    service_type_id uuid REFERENCES public.service_types(id) ON DELETE CASCADE,
    conditions jsonb DEFAULT '{}'::jsonb,
    priority integer DEFAULT 0,
    active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- 4. Habilitar RLS
ALTER TABLE public.service_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activation_rules ENABLE ROW LEVEL SECURITY;

-- 5. Políticas de Isolamento
CREATE POLICY "tenant_service_types" ON public.service_types FOR ALL USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "tenant_form_templates" ON public.form_templates FOR ALL USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "tenant_activation_rules" ON public.activation_rules FOR ALL USING (tenant_id = public.get_user_tenant_id());

-- 6. Permissões para usuários autenticados
GRANT ALL ON TABLE public.service_types TO authenticated;
GRANT ALL ON TABLE public.form_templates TO authenticated;
GRANT ALL ON TABLE public.activation_rules TO authenticated;

-- 7. Seed básico de tipos de serviço (Opcional, mas útil)
DO $$
DECLARE
    v_tenant_id uuid;
BEGIN
    SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = 'nexus-corp' LIMIT 1;
    
    IF v_tenant_id IS NOT NULL THEN
        INSERT INTO public.service_types (tenant_id, name, description)
        VALUES 
            (v_tenant_id, 'Instalação', 'Instalação de novos equipamentos'),
            (v_tenant_id, 'Manutenção Preventiva', 'Visita de rotina'),
            (v_tenant_id, 'Manutenção Corretiva', 'Reparo de falhas')
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- 8. Recarregar Schema
NOTIFY pgrst, 'reload schema';
