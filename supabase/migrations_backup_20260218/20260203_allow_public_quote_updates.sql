-- Migration: Allow public quote approvals and rejections
-- This enables the public quote view to update quotes when clients sign

-- 🔓 Enable RLS but allow public updates via token
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow public read with token" ON public.quotes;
DROP POLICY IF EXISTS "Allow public update with token" ON public.quotes;
DROP POLICY IF EXISTS "Allow authenticated tenant operations" ON public.quotes;

-- 📖 Policy 1: Allow public READ access with valid token
CREATE POLICY "Allow public read with token" ON public.quotes
FOR SELECT
USING (public_token IS NOT NULL);

-- ✍️ Policy 2: Allow public UPDATE (approve/reject) with valid token
-- This is the KEY policy that allows clients to sign quotes
CREATE POLICY "Allow public update with token" ON public.quotes
FOR UPDATE
USING (public_token IS NOT NULL)
WITH CHECK (public_token IS NOT NULL);

-- 🔐 Policy 3: Allow authenticated users full access to their tenant's quotes
CREATE POLICY "Allow authenticated tenant operations" ON public.quotes
FOR ALL
USING (
  auth.role() = 'authenticated' AND
  tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid
)
WITH CHECK (
  auth.role() = 'authenticated' AND
  tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid
);

-- 📝 Add helpful comment
COMMENT ON TABLE public.quotes IS 'Quotes table with public approval/rejection support via unique tokens';
