-- ==============================================================================
-- CREATE TECH_STOCK TABLE FOR TECHNICIAN INVENTORY MANAGEMENT
-- ==============================================================================

-- Create tech_stock table to track items assigned to each technician
CREATE TABLE IF NOT EXISTS public.tech_stock (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
    quantity integer NOT NULL DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    -- Prevent duplicate entries for same tech + item
    UNIQUE(user_id, stock_item_id, tenant_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_tech_stock_user_id ON public.tech_stock(user_id);
CREATE INDEX IF NOT EXISTS idx_tech_stock_tenant_id ON public.tech_stock(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tech_stock_item_id ON public.tech_stock(stock_item_id);

-- Enable RLS
ALTER TABLE public.tech_stock ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "tech_stock_isolation_policy" ON public.tech_stock;

-- Create tenant isolation policy
CREATE POLICY "tech_stock_isolation_policy" ON public.tech_stock FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id())
WITH CHECK (tenant_id = public.get_user_tenant_id());

-- Grant permissions
GRANT ALL ON TABLE public.tech_stock TO authenticated;
GRANT ALL ON TABLE public.tech_stock TO service_role;

-- Force schema reload
NOTIFY pgrst, 'reload schema';
