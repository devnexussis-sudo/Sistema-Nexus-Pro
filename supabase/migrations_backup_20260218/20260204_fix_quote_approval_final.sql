-- Migration: Robust Quote Approval (Find by ID or Token + Date Cast)
-- This migration fixes the "Quote not found" error by allowing lookup by either ID or PUBLIC_TOKEN.
-- It also maintains the DATE type casting for approval_birth_date.

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
SECURITY DEFINER 
AS $$
DECLARE
    v_result JSONB;
    v_affected_rows INT;
    v_birth_date DATE;
BEGIN
    -- 1. Date Casting with Safety
    BEGIN
        IF p_birth_date IS NOT NULL AND p_birth_date <> '' THEN
            v_birth_date := p_birth_date::DATE;
        ELSE
            v_birth_date := NULL;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_birth_date := NULL;
    END;

    -- 2. Update allowing lookup by ID or PUBLIC_TOKEN
    UPDATE public.quotes
    SET 
        status = 'APROVADO',
        approval_document = p_document,
        approval_birth_date = v_birth_date,
        approval_signature = p_signature,
        approved_by_name = p_name,
        approval_metadata = p_metadata,
        approval_latitude = p_lat,
        approval_longitude = p_lng,
        approved_at = NOW()
    WHERE (id::text = p_quote_id OR public_token::text = p_quote_id);
    
    GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
    
    IF v_affected_rows = 0 THEN
        RETURN jsonb_build_object('error', 'Orçamento não encontrado', 'quote_id', p_quote_id);
    END IF;
    
    -- 3. Return updated data
    SELECT jsonb_build_object(
        'id', id,
        'status', status,
        'approved_by_name', approved_by_name,
        'approved_at', approved_at,
        'success', true
    ) INTO v_result
    FROM public.quotes
    WHERE (id::text = p_quote_id OR public_token::text = p_quote_id)
    LIMIT 1;
    
    RETURN v_result;
END;
$$;

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
    v_birth_date DATE;
BEGIN
    BEGIN
        IF p_birth_date IS NOT NULL AND p_birth_date <> '' THEN
            v_birth_date := p_birth_date::DATE;
        ELSE
            v_birth_date := NULL;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_birth_date := NULL;
    END;

    UPDATE public.quotes
    SET 
        status = 'REJEITADO',
        notes = 'MOTIVO DA RECUSA: ' || p_reason,
        approval_document = p_document,
        approval_birth_date = v_birth_date,
        approval_signature = p_signature,
        approved_by_name = p_name,
        approval_metadata = p_metadata,
        approval_latitude = p_lat,
        approval_longitude = p_lng,
        approved_at = NOW()
    WHERE (id::text = p_quote_id OR public_token::text = p_quote_id);
    
    GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
    
    IF v_affected_rows = 0 THEN
        RETURN jsonb_build_object('error', 'Orçamento não encontrado');
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
    WHERE (id::text = p_quote_id OR public_token::text = p_quote_id)
    LIMIT 1;
    
    RETURN v_result;
END;
$$;
