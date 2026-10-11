-- ==============================================================================
-- 🛡️ NEXUS PRO / DUNO: ASAAS WEBHOOK MULTI-TENANT VAULT TOKEN (BIG TECH STANDARD)
-- Arquivo: supabase/migrations/20261011_add_asaas_webhook_token_vault.sql
-- ==============================================================================

BEGIN;

-- 1. Adicionar coluna asaas_webhook_token na tabela segura de segredos (Vault)
ALTER TABLE IF EXISTS public.tenant_secrets 
ADD COLUMN IF NOT EXISTS asaas_webhook_token TEXT;

-- 2. Adicionar na tabela tenant_asaas_settings (retrocompatibilidade e redundância segura)
ALTER TABLE IF EXISTS public.tenant_asaas_settings 
ADD COLUMN IF NOT EXISTS asaas_webhook_token TEXT;

-- 3. Criar índice para busca ultra-rápida na chegada dos webhooks
CREATE INDEX IF NOT EXISTS idx_tenant_secrets_webhook_token 
ON public.tenant_secrets (asaas_webhook_token) 
WHERE asaas_webhook_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_asaas_settings_webhook_token 
ON public.tenant_asaas_settings (asaas_webhook_token) 
WHERE asaas_webhook_token IS NOT NULL;

-- 4. Atualizar a RPC segura update_tenant_secrets para suportar o token de webhook
CREATE OR REPLACE FUNCTION public.update_tenant_secrets(
    p_tenant_id UUID, 
    p_asaas_api_key TEXT DEFAULT NULL, 
    p_uazapi_token TEXT DEFAULT NULL, 
    p_uazapi_instance TEXT DEFAULT NULL,
    p_asaas_webhook_token TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    INSERT INTO public.tenant_secrets (
        tenant_id, 
        asaas_api_key, 
        uazapi_token, 
        uazapi_instance,
        asaas_webhook_token
    )
    VALUES (
        p_tenant_id, 
        p_asaas_api_key, 
        p_uazapi_token, 
        p_uazapi_instance,
        p_asaas_webhook_token
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
        asaas_api_key = COALESCE(p_asaas_api_key, tenant_secrets.asaas_api_key),
        uazapi_token = COALESCE(p_uazapi_token, tenant_secrets.uazapi_token),
        uazapi_instance = COALESCE(p_uazapi_instance, tenant_secrets.uazapi_instance),
        asaas_webhook_token = COALESCE(p_asaas_webhook_token, tenant_secrets.asaas_webhook_token),
        updated_at = NOW();
    
    -- Sincronia com a tabela tenant_asaas_settings
    IF p_asaas_api_key IS NOT NULL OR p_asaas_webhook_token IS NOT NULL THEN
        UPDATE public.tenant_asaas_settings SET
            asaas_api_key = COALESCE(p_asaas_api_key, asaas_api_key),
            asaas_webhook_token = COALESCE(p_asaas_webhook_token, asaas_webhook_token),
            updated_at = NOW()
        WHERE tenant_id = p_tenant_id;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
