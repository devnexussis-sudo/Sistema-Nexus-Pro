-- ============================================================
-- NEXUS: approve_quote_public + reject_quote_public
-- Funções SECURITY DEFINER — executam sem sessão autenticada
-- Chamadas pelo link público do orçamento (cliente final)
-- ============================================================

-- Garante que o schema cache seja recarregado após criação
-- Execute no SQL Editor do Supabase

-- ─────────────────────────────────────────────────────────────
-- 1. APROVAÇÃO
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_quote_public(
    p_quote_id    TEXT,
    p_document    TEXT,
    p_birth_date  TEXT,
    p_signature   TEXT,
    p_name        TEXT,
    p_metadata    JSONB    DEFAULT '{}'::jsonb,
    p_lat         NUMERIC  DEFAULT NULL,
    p_lng         NUMERIC  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_quote RECORD;
BEGIN
    -- 1. Buscar o orçamento pelo ID (UUID como text) ou pelo public_token
    SELECT * INTO v_quote
    FROM public.quotes
    WHERE id::text = p_quote_id
       OR public_token = p_quote_id
    LIMIT 1;

    -- 2. Validações
    IF v_quote IS NULL THEN
        RETURN jsonb_build_object('error', 'Orçamento não encontrado.');
    END IF;

    IF v_quote.status NOT IN ('ABERTO', 'PENDENTE') THEN
        RETURN jsonb_build_object('error', 'Este orçamento não está disponível para aprovação (status: ' || v_quote.status || ').');
    END IF;

    -- 3. Atualizar o orçamento com dados de aprovação
    UPDATE public.quotes
    SET
        status              = 'APROVADO',
        approved_by_name    = p_name,
        approval_document   = p_document,
        approval_birth_date = p_birth_date,
        approval_signature  = p_signature,
        approved_at         = NOW(),
        approval_metadata   = p_metadata,
        approval_latitude   = p_lat,
        approval_longitude  = p_lng,
        updated_at          = NOW()
    WHERE id = v_quote.id;

    RETURN jsonb_build_object('success', true, 'message', 'Orçamento aprovado com sucesso.');

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- Conceder execução para usuários anônimos (link público)
GRANT EXECUTE ON FUNCTION public.approve_quote_public(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, NUMERIC, NUMERIC) TO anon;
GRANT EXECUTE ON FUNCTION public.approve_quote_public(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, NUMERIC, NUMERIC) TO authenticated;


-- ─────────────────────────────────────────────────────────────
-- 2. RECUSA
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_quote_public(
    p_quote_id    TEXT,
    p_document    TEXT,
    p_birth_date  TEXT,
    p_signature   TEXT,
    p_name        TEXT,
    p_reason      TEXT     DEFAULT '',
    p_metadata    JSONB    DEFAULT '{}'::jsonb,
    p_lat         NUMERIC  DEFAULT NULL,
    p_lng         NUMERIC  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_quote RECORD;
BEGIN
    -- 1. Buscar o orçamento pelo ID (UUID como text) ou pelo public_token
    SELECT * INTO v_quote
    FROM public.quotes
    WHERE id::text = p_quote_id
       OR public_token = p_quote_id
    LIMIT 1;

    -- 2. Validações
    IF v_quote IS NULL THEN
        RETURN jsonb_build_object('error', 'Orçamento não encontrado.');
    END IF;

    IF v_quote.status NOT IN ('ABERTO', 'PENDENTE') THEN
        RETURN jsonb_build_object('error', 'Este orçamento não está disponível para recusa (status: ' || v_quote.status || ').');
    END IF;

    -- 3. Atualizar o orçamento com dados de recusa
    UPDATE public.quotes
    SET
        status              = 'REJEITADO',
        approved_by_name    = p_name,
        approval_document   = p_document,
        approval_birth_date = p_birth_date,
        approval_signature  = p_signature,
        approved_at         = NOW(),
        approval_metadata   = COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('rejection_reason', p_reason),
        approval_latitude   = p_lat,
        approval_longitude  = p_lng,
        updated_at          = NOW()
    WHERE id = v_quote.id;

    RETURN jsonb_build_object('success', true, 'message', 'Orçamento recusado.');

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- Conceder execução para usuários anônimos
GRANT EXECUTE ON FUNCTION public.reject_quote_public(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, NUMERIC, NUMERIC) TO anon;
GRANT EXECUTE ON FUNCTION public.reject_quote_public(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, NUMERIC, NUMERIC) TO authenticated;

-- Notificar o PostgREST para recarregar o schema cache
NOTIFY pgrst, 'reload schema';
