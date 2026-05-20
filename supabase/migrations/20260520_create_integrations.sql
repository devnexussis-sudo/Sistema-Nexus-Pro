-- ============================================================================
-- MIGRATION: INTEGRAÇÕES (API Keys & Webhooks)
-- DESCRIPTION: Tabelas para suportar chaves de API restritas e webhooks.
-- ============================================================================

-- 1. TABELA DE API KEYS
CREATE TABLE IF NOT EXISTS public.api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    last_used_at TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'active', -- 'active' ou 'revoked'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id)
);

-- Habilitar RLS
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Políticas (Adaptadas para seu sistema de tenant)
CREATE POLICY "Users can view tenant API keys" ON public.api_keys
    FOR SELECT USING (
        tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1)
    );

CREATE POLICY "Users can insert API keys" ON public.api_keys
    FOR INSERT WITH CHECK (
        tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1)
    );

CREATE POLICY "Users can update API keys" ON public.api_keys
    FOR UPDATE USING (
        tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1)
    );

CREATE POLICY "Users can delete API keys" ON public.api_keys
    FOR DELETE USING (
        tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1)
    );

-- 2. TABELA DE WEBHOOKS
CREATE TABLE IF NOT EXISTS public.webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    secret TEXT NOT NULL,
    events TEXT[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id)
);

-- Habilitar RLS
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tenant webhooks" ON public.webhooks
    FOR SELECT USING (
        tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1)
    );

CREATE POLICY "Users can insert webhooks" ON public.webhooks
    FOR INSERT WITH CHECK (
        tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1)
    );

CREATE POLICY "Users can update webhooks" ON public.webhooks
    FOR UPDATE USING (
        tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1)
    );

CREATE POLICY "Users can delete webhooks" ON public.webhooks
    FOR DELETE USING (
        tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1)
    );
