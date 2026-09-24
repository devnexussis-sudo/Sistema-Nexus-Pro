-- ==============================================================================
-- 🛡️ NEXUS PRO: VAULT DE SEGREDOS (BIG TECH STANDARD)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_secrets (
    tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    asaas_api_key TEXT,
    uazapi_token TEXT,
    uazapi_instance TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ativar Blindagem (Bloqueio total de API Web)
ALTER TABLE public.tenant_secrets ENABLE ROW LEVEL SECURITY;

-- Migrar os dados silenciosamente (agora pegando Asaas da tabela certa)
INSERT INTO public.tenant_secrets (tenant_id, asaas_api_key, uazapi_token, uazapi_instance)
SELECT 
    t.id, 
    tas.asaas_api_key, 
    t.whatsapp_settings->>'uazapi_token', 
    t.whatsapp_settings->>'uazapi_instance'
FROM public.tenants t
LEFT JOIN public.tenant_asaas_settings tas ON tas.tenant_id = t.id
ON CONFLICT (tenant_id) DO UPDATE SET
    asaas_api_key = COALESCE(EXCLUDED.asaas_api_key, tenant_secrets.asaas_api_key),
    uazapi_token = COALESCE(EXCLUDED.uazapi_token, tenant_secrets.uazapi_token),
    uazapi_instance = COALESCE(EXCLUDED.uazapi_instance, tenant_secrets.uazapi_instance);

-- Criar a Função Segura para a tela de configurações (Mascaramento)
CREATE OR REPLACE FUNCTION get_integration_status(p_tenant_id UUID)
RETURNS JSON AS $$
DECLARE
    v_secrets RECORD;
    v_masked_asaas TEXT := NULL;
    v_masked_uazapi TEXT := NULL;
BEGIN
    SELECT * INTO v_secrets FROM public.tenant_secrets WHERE tenant_id = p_tenant_id;
    IF v_secrets.asaas_api_key IS NOT NULL AND length(v_secrets.asaas_api_key) > 4 THEN
        v_masked_asaas := 'sk_live_********' || right(v_secrets.asaas_api_key, 4);
    END IF;
    IF v_secrets.uazapi_token IS NOT NULL AND length(v_secrets.uazapi_token) > 4 THEN
        v_masked_uazapi := 'token_********' || right(v_secrets.uazapi_token, 4);
    END IF;
    RETURN json_build_object('has_asaas', v_secrets.asaas_api_key IS NOT NULL, 'has_uazapi', v_secrets.uazapi_token IS NOT NULL, 'masked_asaas', v_masked_asaas, 'masked_uazapi', v_masked_uazapi, 'uazapi_instance', v_secrets.uazapi_instance);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função Segura para salvar chaves (Sem vazar no tráfego)
CREATE OR REPLACE FUNCTION update_tenant_secrets(
    p_tenant_id UUID, p_asaas_api_key TEXT DEFAULT NULL, p_uazapi_token TEXT DEFAULT NULL, p_uazapi_instance TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    INSERT INTO public.tenant_secrets (tenant_id, asaas_api_key, uazapi_token, uazapi_instance)
    VALUES (p_tenant_id, p_asaas_api_key, p_uazapi_token, p_uazapi_instance)
    ON CONFLICT (tenant_id) DO UPDATE SET
        asaas_api_key = COALESCE(p_asaas_api_key, tenant_secrets.asaas_api_key),
        uazapi_token = COALESCE(p_uazapi_token, tenant_secrets.uazapi_token),
        uazapi_instance = COALESCE(p_uazapi_instance, tenant_secrets.uazapi_instance),
        updated_at = NOW();
    
    -- Sincronia provisória com a tabela antiga (até atualizarmos o código amanhã)
    UPDATE public.tenants SET 
        whatsapp_settings = jsonb_set(
            jsonb_set(COALESCE(whatsapp_settings, '{}'::jsonb), '{uazapi_token}', to_jsonb(COALESCE(p_uazapi_token, whatsapp_settings->>'uazapi_token'))),
            '{uazapi_instance}', to_jsonb(COALESCE(p_uazapi_instance, whatsapp_settings->>'uazapi_instance'))
        )
    WHERE id = p_tenant_id;

    UPDATE public.tenant_asaas_settings SET
        asaas_api_key = COALESCE(p_asaas_api_key, asaas_api_key)
    WHERE tenant_id = p_tenant_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
