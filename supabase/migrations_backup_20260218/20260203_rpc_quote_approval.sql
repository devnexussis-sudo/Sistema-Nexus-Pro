-- Migration: RPC Function for Public Quote Approval (Bypass RLS)
-- Similar to the location update fix, this creates a secure function that allows
-- public quote approvals without RLS blocking

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
BEGIN
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
    WHERE id = p_quote_id
    RETURNING jsonb_build_object(
        'id', id,
        'status', status,
        'approved_by_name', approved_by_name,
        'approved_at', approved_at
    ) INTO v_result;

    -- Return success with updated data
    RETURN COALESCE(v_result, '{"error": "Quote not found"}'::jsonb);
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
SECURITY DEFINER -- Runs with elevated permissions, bypassing RLS
AS $$
DECLARE
    v_result JSONB;
BEGIN
    -- Update the quote with rejection
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
    WHERE id = p_quote_id
    RETURNING jsonb_build_object(
        'id', id,
        'status', status,
        'approved_by_name', approved_by_name,
        'approved_at', approved_at,
        'notes', notes
    ) INTO v_result;

    -- Return success with updated data
    RETURN COALESCE(v_result, '{"error": "Quote not found"}'::jsonb);
END;
$$;

-- Grant execute permissions to anonymous users (public access)
GRANT EXECUTE ON FUNCTION approve_quote_public(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, DOUBLE PRECISION, DOUBLE PRECISION) TO anon;
GRANT EXECUTE ON FUNCTION reject_quote_public(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, DOUBLE PRECISION, DOUBLE PRECISION) TO anon;

-- Add helpful comments
COMMENT ON FUNCTION approve_quote_public IS 'Public function to approve quotes - bypasses RLS for public quote approvals';
COMMENT ON FUNCTION reject_quote_public IS 'Public function to reject quotes - bypasses RLS for public quote rejections';
