-- Migration: Fix Atomic Order Sequential ID and Collisions
-- 1. Ensure public.tenant_sequences exists
CREATE TABLE IF NOT EXISTS public.tenant_sequences (
    tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    last_order_id INTEGER DEFAULT 0
);

-- 🛡️ Nexus Multi-Tenant Unlock: Remove global ID constraint
-- Altera a chave primária para (id, tenant_id) permitindo que empresas diferentes usem o mesmo número
DO $$ 
BEGIN
    -- Remove a PK antiga se existir
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'orders' AND constraint_type = 'PRIMARY KEY') THEN
        ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_pkey CASCADE;
    END IF;
    -- Cria a nova PK composta
    ALTER TABLE public.orders ADD PRIMARY KEY (id, tenant_id);
EXCEPTION WHEN OTHERS THEN 
    RAISE NOTICE 'PK already updated or table empty';
END $$;

ALTER TABLE public.tenant_sequences ENABLE ROW LEVEL SECURITY;

-- 2. Synchronize tenant_sequences with current order counts
INSERT INTO public.tenant_sequences (tenant_id, last_order_id)
SELECT id, (SELECT count(*) FROM public.orders WHERE tenant_id = tenants.id)
FROM public.tenants
ON CONFLICT (tenant_id) DO UPDATE SET last_order_id = EXCLUDED.last_order_id;

-- 3. Unified Atomic RPC for OS ID Generation
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
    -- Get tenant configuration
    SELECT 
        COALESCE(os_prefix, 'OS-'), 
        COALESCE(os_start_number, 1000)
    INTO v_prefix, v_start
    FROM public.tenants
    WHERE id = p_tenant_id;

    -- Initialization check
    IF NOT EXISTS (SELECT 1 FROM public.tenant_sequences WHERE tenant_id = p_tenant_id) THEN
        INSERT INTO public.tenant_sequences (tenant_id, last_order_id)
        VALUES (p_tenant_id, (SELECT count(*) FROM public.orders WHERE tenant_id = p_tenant_id));
    END IF;

    -- Atomic Loop to find the next available ID
    LOOP
        UPDATE public.tenant_sequences
        SET last_order_id = last_order_id + 1
        WHERE tenant_id = p_tenant_id
        RETURNING last_order_id INTO v_seq;

        v_final_id := v_prefix || (v_start + v_seq - 1)::TEXT;

        -- 🛡️ Nexus Fix: Check for collision ONLY within the SAME tenant
        SELECT EXISTS (
            SELECT 1 FROM public.orders 
            WHERE id = v_final_id 
            AND tenant_id = p_tenant_id
        ) INTO v_collision;

        EXIT WHEN NOT v_collision;
    END LOOP;

    RETURN (v_start + v_seq - 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_order_id TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_order_id TO service_role;
