-- Migration: Mercado Pago OAuth 2.0 Settings & Payment Gateway Columns
-- Author: Nexus Dev Team
-- Date: 2026-08-10

-- 1. Tabela de configurações do Mercado Pago por Tenant (sem restrição estrita de tipo na FK)
CREATE TABLE IF NOT EXISTS public.tenant_mercadopago_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    mp_user_id TEXT,
    mp_public_key TEXT,
    mp_access_token TEXT,
    mp_refresh_token TEXT,
    mp_webhook_secret TEXT,
    account_email TEXT,
    account_name TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'disconnected', 'error')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id)
);

ALTER TABLE public.tenant_mercadopago_settings ADD COLUMN IF NOT EXISTS mp_webhook_secret TEXT DEFAULT NULL;

-- RLS (Row Level Security) para tenant_mercadopago_settings
ALTER TABLE public.tenant_mercadopago_settings ENABLE ROW LEVEL SECURITY;

-- Política de Leitura/Escrita por Tenant
DROP POLICY IF EXISTS tenant_mercadopago_settings_isolation ON public.tenant_mercadopago_settings;
CREATE POLICY tenant_mercadopago_settings_isolation ON public.tenant_mercadopago_settings
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- 2. Adicionar colunas de Gateway em Orders
ALTER TABLE public.orders 
    ADD COLUMN IF NOT EXISTS gateway_provider TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS gateway_payment_id TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS gateway_pix_code TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS gateway_qr_code_url TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS gateway_ticket_url TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS gateway_status TEXT DEFAULT NULL;

-- 3. Adicionar colunas de Gateway em Quotes
ALTER TABLE public.quotes 
    ADD COLUMN IF NOT EXISTS gateway_provider TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS gateway_payment_id TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS gateway_pix_code TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS gateway_qr_code_url TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS gateway_ticket_url TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS gateway_status TEXT DEFAULT NULL;

-- Índices para busca rápida de webhooks por payment_id
CREATE INDEX IF NOT EXISTS idx_orders_gateway_payment_id ON public.orders(gateway_payment_id);
CREATE INDEX IF NOT EXISTS idx_quotes_gateway_payment_id ON public.quotes(gateway_payment_id);
