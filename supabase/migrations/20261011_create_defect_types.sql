-- ============================================================================
-- Migration: defect_types
-- Tabela de tipos de defeitos por empresa (multi-tenant)
-- Código de 4 dígitos (manual ou gerado) para seleção na abertura de OS
-- ============================================================================

-- Garante a existência da função de resolução de tenant caso ainda não exista no banco
CREATE OR REPLACE FUNCTION public.get_auth_tenant_id_fallback()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid,
    (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid,
    (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );
$$;

CREATE TABLE IF NOT EXISTS public.defect_types (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    code VARCHAR(10) NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,

    CONSTRAINT defect_types_tenant_code_key UNIQUE (tenant_id, code)
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_defect_types_tenant_id ON public.defect_types(tenant_id);
CREATE INDEX IF NOT EXISTS idx_defect_types_code ON public.defect_types(tenant_id, code);

-- RLS (Row Level Security)
ALTER TABLE public.defect_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "defect_types_select" ON public.defect_types;
CREATE POLICY "defect_types_select" ON public.defect_types
    FOR SELECT TO authenticated
    USING (
        tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
        OR tenant_id = COALESCE(
            (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid,
            (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid
        )
    );

DROP POLICY IF EXISTS "defect_types_insert" ON public.defect_types;
CREATE POLICY "defect_types_insert" ON public.defect_types
    FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
        OR tenant_id = COALESCE(
            (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid,
            (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid
        )
    );

DROP POLICY IF EXISTS "defect_types_update" ON public.defect_types;
CREATE POLICY "defect_types_update" ON public.defect_types
    FOR UPDATE TO authenticated
    USING (
        tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
        OR tenant_id = COALESCE(
            (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid,
            (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid
        )
    );

DROP POLICY IF EXISTS "defect_types_delete" ON public.defect_types;
CREATE POLICY "defect_types_delete" ON public.defect_types
    FOR DELETE TO authenticated
    USING (
        tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
        OR tenant_id = COALESCE(
            (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid,
            (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid
        )
    );

-- Vínculo na tabela de ordens de serviço (orders)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS defect_type_id UUID REFERENCES public.defect_types(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS defect_type_code VARCHAR(10);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS defect_type_name TEXT;

-- Conceder permissões para roles autenticadas e service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.defect_types TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.defect_types TO service_role;
