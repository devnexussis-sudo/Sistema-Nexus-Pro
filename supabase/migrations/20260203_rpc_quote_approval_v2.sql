-- Migration: RPC Function for Public Quote Approval (Bypass RLS) - WITH DEBUG LOGGING
-- This version includes RAISE NOTICE for debugging

-- 🎯 Function to approve quote (bypasses RLS with SECURITY DEFINER)
CREATE OR REPLACE FUNCTION approve_quote_public(
    p_quote_id TEXT,
    p_document TEXT,
    p_birth_date TEXT,
    p_signature TEXT,
    p_name TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_lat DOUBLE PRECISION DEFAULT NULL,
    p_lng DOUBLE PRECISION DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with elevated permissions, bypassing RLS
AS $$
DECLARE
    v_result JSONB;
    v_affected_rows INT;
BEGIN
    RAISE NOTICE '[RPC] approve_quote_public chamada para ID: %', p_quote_id;
    RAISE NOTICE '[RPC] Aprovador: %, Documento: %', p_name, p_document;
    
    -- Update the quote (RLS is bypassed because of SECURITY DEFINER)
    UPDATE public.quotes
    SET 
        status = 'APROVADO',
        approval_document = p_document,
        approval_birth_date = p_birth_date,
        approval_signature = p_signature,
        approved_by_name = p_name,
        approval_metadata = p_metadata,
        approval_latitude = p_lat,
        approval_longitude = p_lng,
        approved_at = NOW()
    WHERE id = p_quote_id;
    
    GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
    RAISE NOTICE '[RPC] Linhas afetadas: %', v_affected_rows;
    
    IF v_affected_rows = 0 THEN
        RAISE NOTICE '[RPC] ERRO: Nenhuma linha foi atualizada! Orçamento % não encontrado.', p_quote_id;
        RETURN jsonb_build_object('error', 'Quote not found', 'quote_id', p_quote_id);
    END IF;
    
    -- Busca os dados atualizados
    SELECT jsonb_build_object(
        'id', id,
        'status', status,
        'approved_by_name', approved_by_name,
        'approved_at', approved_at,
        'success', true
    ) INTO v_result
    FROM public.quotes
    WHERE id = p_quote_id;
    
    RAISE NOTICE '[RPC] Resultado: %', v_result;
    RETURN v_result;
END;
$$;

-- 🎯 Function to reject quote (bypasses RLS with SECURITY DEFINER)
CREATE OR REPLACE FUNCTION reject_quote_public(
    p_quote_id TEXT,
    p_document TEXT,
    p_birth_date TEXT,
    p_signature TEXT,
    p_name TEXT,
    p_reason TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_lat DOUBLE PRECISION DEFAULT NULL,
    p_lng DOUBLE PRECISION DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
    v_affected_rows INT;
BEGIN
    RAISE NOTICE '[RPC] reject_quote_public chamada para ID: %', p_quote_id;
    
    UPDATE public.quotes
    SET 
        status = 'REJEITADO',
        notes = 'MOTIVO DA RECUSA: ' || p_reason,
        approval_document = p_document,
        approval_birth_date = p_birth_date,
        approval_signature = p_signature,
        approved_by_name = p_name,
        approval_metadata = p_metadata,
        approval_latitude = p_lat,
        approval_longitude = p_lng,
        approved_at = NOW()
    WHERE id = p_quote_id;
    
    GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
    RAISE NOTICE '[RPC] Linhas afetadas na recusa: %', v_affected_rows;
    
    IF v_affected_rows = 0 THEN
        RETURN jsonb_build_object('error', 'Quote not found');
    END IF;
    
    SELECT jsonb_build_object(
        'id', id,
        'status', status,
        'approved_by_name', approved_by_name,
        'approved_at', approved_at,
        'notes', notes,
        'success', true
    ) INTO v_result
    FROM public.quotes
    WHERE id = p_quote_id;
    
    RETURN v_result;
END;
$$;

-- Grant execute permissions to anonymous users AND authenticated users
GRANT EXECUTE ON FUNCTION approve_quote_public(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, DOUBLE PRECISION, DOUBLE PRECISION) TO anon;
GRANT EXECUTE ON FUNCTION approve_quote_public(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_quote_public(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, DOUBLE PRECISION, DOUBLE PRECISION) TO anon;
GRANT EXECUTE ON FUNCTION reject_quote_public(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;

COMMENT ON FUNCTION approve_quote_public IS 'Public function to approve quotes - bypasses RLS with debug logging';
COMMENT ON FUNCTION reject_quote_public IS 'Public function to reject quotes - bypasses RLS with debug logging';
