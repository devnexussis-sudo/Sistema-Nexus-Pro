-- Migration: Fix Atomic Order Sequential ID and Collisions
-- 1. Ensure public.tenant_sequences exists
CREATE TABLE IF NOT EXISTS public.tenant_sequences (
    tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    last_order_id INTEGER DEFAULT 0
);

ALTER TABLE public.tenant_sequences ENABLE ROW LEVEL SECURITY;

-- 2. Synchronize tenant_sequences with current order counts
-- This sets the starting point to the current MAX sequential number part or just the COUNT
-- Using a subquery to find the current count as a starting point.
-- Note: The RPC will loop if this count still lands on an existing ID.
INSERT INTO public.tenant_sequences (tenant_id, last_order_id)
SELECT id, (SELECT count(*) FROM public.orders WHERE tenant_id = tenants.id)
FROM public.tenants
ON CONFLICT (tenant_id) DO UPDATE SET last_order_id = EXCLUDED.last_order_id;

-- 3. Unified Atomic RPC for OS ID Generation
CREATE OR REPLACE FUNCTION public.get_next_order_id(p_tenant_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with admin bypass to check all orders for uniqueness
AS $$
DECLARE
    v_prefix TEXT;
    v_start INTEGER;
    v_seq INTEGER;
    v_final_id TEXT;
    v_collision BOOLEAN;
BEGIN
    -- Get tenant configuration
    SELECT 
        COALESCE(os_prefix, 'OS-'), 
        COALESCE(os_start_number, 1000)
    INTO v_prefix, v_start
    FROM public.tenants
    WHERE id = p_tenant_id;

    -- Initialization check (safety if sync missed it)
    IF NOT EXISTS (SELECT 1 FROM public.tenant_sequences WHERE tenant_id = p_tenant_id) THEN
        INSERT INTO public.tenant_sequences (tenant_id, last_order_id)
        VALUES (p_tenant_id, (SELECT count(*) FROM public.orders WHERE tenant_id = p_tenant_id));
    END IF;

    -- Atomic Loop to find the next available ID
    LOOP
        -- 1. Increment the atomic sequence for this tenant
        UPDATE public.tenant_sequences
        SET last_order_id = last_order_id + 1
        WHERE tenant_id = p_tenant_id
        RETURNING last_order_id INTO v_seq;

        -- 2. Construct the projected final ID
        -- Formula: prefix + (start_number + seq_offset - 1)
        -- Example: start 1000 + seq 1 - 1 = 1000
        v_final_id := v_prefix || (v_start + v_seq - 1)::TEXT;

        -- 3. Check for collision GLOBALLY (in case multiple tenants share the same prefix)
        SELECT EXISTS (
            SELECT 1 FROM public.orders WHERE id = v_final_id
        ) INTO v_collision;

        -- Exit loop only when a unique ID is found
        EXIT WHEN NOT v_collision;
    END LOOP;

    -- Return the numeric part to the frontend (frontend adds the prefix)
    RETURN (v_start + v_seq - 1);
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.get_next_order_id TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_order_id TO service_role;
