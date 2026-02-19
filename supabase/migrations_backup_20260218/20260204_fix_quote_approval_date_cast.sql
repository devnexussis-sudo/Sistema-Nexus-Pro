-- Migration: Fix Quote Approval Date Type Mismatch
-- The RPC functions were attempting to assign a TEXT parameter directly to a DATE column.
-- This migration adds explicit casting to ::DATE.

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
SECURITY DEFINER 
AS $$
DECLARE
    v_result JSONB;
    v_affected_rows INT;
    v_birth_date DATE;
BEGIN
    -- Explicit casting with safety handling
    BEGIN
        v_birth_date := p_birth_date::DATE;
    EXCEPTION WHEN OTHERS THEN
        v_birth_date := NULL;
    END;

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
    WHERE id = p_quote_id;
    
    GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
    
    IF v_affected_rows = 0 THEN
        RETURN jsonb_build_object('error', 'Quote not found', 'quote_id', p_quote_id);
    END IF;
    
    SELECT jsonb_build_object(
        'id', id,
        'status', status,
        'approved_by_name', approved_by_name,
        'approved_at', approved_at,
        'success', true
    ) INTO v_result
    FROM public.quotes
    WHERE id = p_quote_id;
    
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
    v_birth_date DATE;
BEGIN
    -- Explicit casting with safety handling
    BEGIN
        v_birth_date := p_birth_date::DATE;
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
    WHERE id = p_quote_id;
    
    GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
    
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
