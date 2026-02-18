-- Migration: Fix Order ID Generation Logic & Ensure Dependencies

-- 1. Ensure the sequence table exists (Missing dependency fix)
CREATE TABLE IF NOT EXISTS public.tenant_sequences (
    tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    last_order_id INTEGER DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.tenant_sequences ENABLE ROW LEVEL SECURITY;

-- 2. Initialize sequences for existing tenants if missing
INSERT INTO public.tenant_sequences (tenant_id, last_order_id)
SELECT id, (SELECT count(*) FROM public.orders WHERE tenant_id = tenants.id)
FROM public.tenants
ON CONFLICT (tenant_id) DO NOTHING;

-- 3. Update Function Logic
-- Drop first to allow return type changes if needed
DROP FUNCTION IF EXISTS public.get_next_order_id(uuid);

CREATE OR REPLACE FUNCTION public.get_next_order_id(p_tenant_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER 
AS $$
DECLARE
    v_prefix TEXT;
    v_start INTEGER;
    v_seq INTEGER;
    v_final_id TEXT;
    v_collision BOOLEAN;
BEGIN
    -- Get tenant configuration (default start: 1000)
    SELECT 
        COALESCE(os_prefix, 'OS-'), 
        COALESCE(os_start_number, 1000)
    INTO v_prefix, v_start
    FROM public.tenants
    WHERE id = p_tenant_id;

    -- Initialization check: Create sequence entry if missing (Double check)
    IF NOT EXISTS (SELECT 1 FROM public.tenant_sequences WHERE tenant_id = p_tenant_id) THEN
        INSERT INTO public.tenant_sequences (tenant_id, last_order_id)
        VALUES (p_tenant_id, (SELECT count(*) FROM public.orders WHERE tenant_id = p_tenant_id));
    END IF;

    -- Atomic Loop to find the next available ID
    LOOP
        -- Increment sequence
        UPDATE public.tenant_sequences
        SET last_order_id = last_order_id + 1,
            updated_at = NOW()
        WHERE tenant_id = p_tenant_id
        RETURNING last_order_id INTO v_seq;

        -- Format Expected Display ID (e.g. OS-1005)
        v_final_id := v_prefix || (v_start + v_seq - 1)::TEXT;

        -- 🛡️ CRITICAL FIX: Check for collision on 'display_id' column, NOT 'id' column
        SELECT EXISTS (
            SELECT 1 FROM public.orders 
            WHERE display_id = v_final_id 
            AND tenant_id = p_tenant_id
        ) INTO v_collision;

        -- If no collision found, this ID is safe to use
        EXIT WHEN NOT v_collision;
        
        -- If collision found, loop will continue and increment again
    END LOOP;

    RETURN (v_start + v_seq - 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_order_id TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_order_id TO service_role;
