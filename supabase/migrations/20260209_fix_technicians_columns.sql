-- ==============================================================================
-- FIX: ADD MISSING COLUMNS TO TECHNICIANS TABLE & SYNC RLS
-- ==============================================================================

-- 1. Add missing columns used by the frontend
ALTER TABLE public.technicians ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.technicians ADD COLUMN IF NOT EXISTS avatar text;

-- 2. Ensure RLS is active and correct
ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation for technicians" ON public.technicians;
DROP POLICY IF EXISTS "technicians_isolation_policy" ON public.technicians;

CREATE POLICY "technicians_isolation_policy" ON public.technicians FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id())
WITH CHECK (tenant_id = public.get_user_tenant_id());

-- 3. Grant permissions just in case
GRANT ALL ON TABLE public.technicians TO authenticated;
GRANT ALL ON TABLE public.technicians TO service_role;

-- 4. Sync with users table (if any tech is missing there but in auth)
-- This is a safety measure to ensure the FK doesn't fail
INSERT INTO public.users (id, name, email, role, tenant_id, active)
SELECT id, name, email, 'TECHNICIAN', tenant_id, active
FROM public.technicians
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
