-- 🚨 ULTIMATE LOCATION FIX SCRIPT 🚨
-- Run this entire script in Supabase SQL Editor to fix permissions and logic.

-- 1. Ensure columns exist (Idempotent)
ALTER TABLE public.technicians ADD COLUMN IF NOT EXISTS last_latitude DOUBLE PRECISION;
ALTER TABLE public.technicians ADD COLUMN IF NOT EXISTS last_longitude DOUBLE PRECISION;
ALTER TABLE public.technicians ADD COLUMN IF NOT EXISTS speed DOUBLE PRECISION;
ALTER TABLE public.technicians ADD COLUMN IF NOT EXISTS heading DOUBLE PRECISION;
ALTER TABLE public.technicians ADD COLUMN IF NOT EXISTS accuracy DOUBLE PRECISION;
ALTER TABLE public.technicians ADD COLUMN IF NOT EXISTS battery_level INTEGER;
ALTER TABLE public.technicians ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;

-- 2. Clean up old Policies to avoid conflicts (Nuclear Option for Technicians Table)
DROP POLICY IF EXISTS "Techs can update their own location" ON public.technicians;
DROP POLICY IF EXISTS "Enable update for users based on id" ON public.technicians;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.technicians;
DROP POLICY IF EXISTS "Allow Read All" ON public.technicians;
DROP POLICY IF EXISTS "Allow Self Update" ON public.technicians;

-- 3. Create Simplified, Permissive Policies for Testing
-- Allow ANY authenticated user to read technicians (needed for Admin panel & App)
CREATE POLICY "Allow Read All"
ON public.technicians FOR SELECT
TO authenticated
USING (true);

-- Allow Users to Update their OWN record (Matching ID)
CREATE POLICY "Allow Self Update"
ON public.technicians FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 4. Re-create the RPC Function with DEBUGGING Capabilities
-- First, DROP the old function because we are changing the Return Type from VOID to JSON
DROP FUNCTION IF EXISTS update_tech_location_v2(double precision,double precision,double precision,double precision,double precision,integer);

CREATE OR REPLACE FUNCTION update_tech_location_v2(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_accuracy DOUBLE PRECISION DEFAULT NULL,
  p_speed DOUBLE PRECISION DEFAULT NULL,
  p_heading DOUBLE PRECISION DEFAULT NULL,
  p_battery INTEGER DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER -- ⚠️ Runs as Superuser (Bypasses RLS)
AS $$
DECLARE
  v_tech_id UUID;
  v_updated_rows INTEGER;
BEGIN
  -- Get ID securely from Auth context
  v_tech_id := auth.uid();

  IF v_tech_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not Authenticated');
  END IF;

  -- Perform Update directly
  UPDATE public.technicians
  SET 
    last_latitude = p_lat,
    last_longitude = p_lng,
    accuracy = p_accuracy,
    speed = p_speed,
    heading = p_heading,
    battery_level = p_battery,
    last_seen = NOW()
  WHERE id = v_tech_id;

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  IF v_updated_rows = 0 THEN
    -- If 0 rows updated, it means ID exists in Auth but NOT in Technicians table.
    RETURN json_build_object(
        'success', false, 
        'error', 'USER_NOT_FOUND_IN_TABLE', 
        'debug_id', v_tech_id,
        'message', 'User ID exists in Auth but not in technicians table. Please create the record manually.'
    );
  END IF;

  RETURN json_build_object(
      'success', true, 
      'action', 'updated', 
      'rows', v_updated_rows, 
      'id', v_tech_id
  );
END;
$$;

-- 5. Grant Permissions explicitly
GRANT EXECUTE ON FUNCTION update_tech_location_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION update_tech_location_v2 TO service_role;
GRANT ALL ON TABLE public.technicians TO authenticated;
GRANT ALL ON TABLE public.technicians TO service_role;

-- 6. Verify Output
SELECT '✅ Permissions Fixed & RPC Updated. Try turning GPS on/off in app.' as status;

-- 7. 🛡️ NEXUS OS VISIBILITY FIX (Security Policy)
-- This ensures technicians ONLY see orders assigned to them, while Admins see everything.

-- First, enable RLS on orders (should already be enabled, but let's be sure)
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Drop existing generic policy
DROP POLICY IF EXISTS "Orders SELECT" ON public.orders;
DROP POLICY IF EXISTS "Tenant isolation orders SELECT" ON public.orders;
DROP POLICY IF EXISTS "Orders Visibility Policy" ON public.orders;
DROP POLICY IF EXISTS "Orders Update Policy" ON public.orders;
DROP POLICY IF EXISTS "Service Role Full Access" ON public.orders;

-- Create New Secure Policies
CREATE POLICY "Orders Visibility Policy"
ON public.orders
FOR SELECT
TO authenticated
USING (
    tenant_id = public.get_user_tenant_id() AND (
        public.is_admin() OR 
        assigned_to = auth.uid()
    )
);

-- Allow Admins and Technicians to update their assigned orders
DROP POLICY IF EXISTS "Orders INSERT/UPDATE" ON public.orders;
CREATE POLICY "Orders Update Policy"
ON public.orders
FOR UPDATE
TO authenticated
USING (
    tenant_id = public.get_user_tenant_id() AND (
        public.is_admin() OR 
        assigned_to = auth.uid()
    )
)
WITH CHECK (
    tenant_id = public.get_user_tenant_id() AND (
        public.is_admin() OR 
        assigned_to = auth.uid()
    )
);

-- Ensure service_role can always see everything (for background tasks/admin panel)
CREATE POLICY "Service Role Full Access" 
ON public.orders FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

SELECT '🛡️ OS Security Policies Applied. Technicians are now restricted to assigned orders.' as security_status;
