-- ==============================================================================
-- FIX SERVICE_TYPES TABLE AND RLS POLICIES  
-- Resolves 400 Bad Request errors when switching tabs
-- ==============================================================================
-- Date: 2026-02-10
-- Issue: When user switches back to Formul tab after inactivity,
--        system tries to reload data and gets 400 error, losing all data

-- 1. DROP conflicting policies
DROP POLICY IF EXISTS "tenant_service_types" ON public.service_types;
DROP POLICY IF EXISTS "service_types_isolation_policy" ON public.service_types;
DROP POLICY IF EXISTS "service_types_tenant_policy" ON public.service_types;

-- 2. ENABLE RLS
ALTER TABLE public.service_types ENABLE ROW LEVEL SECURITY;

-- 3. CREATE comprehensive policy for all operations
CREATE POLICY "service_types_all_operations_policy" 
ON public.service_types 
FOR ALL 
TO authenticated
USING (tenant_id = public.get_user_tenant_id())
WITH CHECK (tenant_id = public.get_user_tenant_id());

-- 4. GRANT permissions
GRANT ALL ON TABLE public.service_types TO authenticated;

-- 5. Ensure get_user_tenant_id() function exists and is stable
-- (Should already exist from previous migrations, but verify)
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tenant_uuid uuid;
BEGIN
  -- Try JWT first
  tenant_uuid := NULLIF(current_setting('request.jwt.claims', true)::json->>'metaTenant', '')::uuid;
  IF tenant_uuid IS NULL THEN
    tenant_uuid := NULLIF(current_setting('request.jwt.claims', true)::json->>'tenant_id', '')::uuid;
  END IF;
  
  IF tenant_uuid IS NOT NULL THEN RETURN tenant_uuid; END IF;

  -- Try database (direct query, no RLS trigger)
  SELECT tenant_id INTO tenant_uuid FROM public.users WHERE id = auth.uid();
  RETURN tenant_uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- 6. Validation
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'service_types' 
    AND policyname = 'service_types_all_operations_policy'
  ) THEN
    RAISE NOTICE '✅ Policy service_types_all_operations_policy created successfully';
  ELSE
    RAISE WARNING '❌ Failed to create policy service_types_all_operations_policy';
  END IF;
END $$;

-- 7. Reload schema
NOTIFY pgrst, 'reload schema';
