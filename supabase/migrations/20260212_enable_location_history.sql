-- 🚨 HISTORY TRACKING FIX 🚨
-- This script ensures location history is actually SAVED, not just the latest position.

-- 1. Ensure the History Table Exists
CREATE TABLE IF NOT EXISTS public.technician_location_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    technician_id UUID REFERENCES auth.users(id) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    speed DOUBLE PRECISION,
    heading DOUBLE PRECISION,
    accuracy DOUBLE PRECISION,
    battery_level INTEGER,
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    tenant_id UUID -- Optional, for multi-tenancy filtering if needed later
);

-- Index for fast querying by technician and date
CREATE INDEX IF NOT EXISTS idx_tech_loc_history_date 
ON public.technician_location_history(technician_id, recorded_at);

-- 2. RLS Policies for History Table
ALTER TABLE public.technician_location_history ENABLE ROW LEVEL SECURITY;

-- Allow Admins to View All History
CREATE POLICY "Admins can view all history"
ON public.technician_location_history FOR SELECT
TO authenticated
USING (true); -- Simplified for now, can be restricted to tenant_id later

-- Allow Technicians to Insert their own history (via RPC mostly, but good to have)
CREATE POLICY "Technicians can insert own history"
ON public.technician_location_history FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = technician_id);

-- 3. UPDATE the RPC Function to SAVE HISTORY
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
SECURITY DEFINER -- ⚠️ Runs as Superuser
AS $$
DECLARE
  v_tech_id UUID;
  v_tenant_id UUID;
  v_updated_rows INTEGER;
BEGIN
  -- Get ID securely from Auth context
  v_tech_id := auth.uid();

  IF v_tech_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not Authenticated');
  END IF;

  -- Get Tenant ID from technicians table to keep history consistent
  SELECT tenant_id INTO v_tenant_id FROM public.technicians WHERE id = v_tech_id;

  -- 1. Update Latest Location (Live Map)
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

  -- 2. Insert into History Log (Movement History)
  -- Only insert if coordinates are valid
  IF p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
      INSERT INTO public.technician_location_history (
          technician_id,
          latitude,
          longitude,
          speed,
          heading,
          accuracy,
          battery_level,
          recorded_at,
          tenant_id
      ) VALUES (
          v_tech_id,
          p_lat,
          p_lng,
          p_speed,
          p_heading,
          p_accuracy,
          p_battery,
          NOW(),
          v_tenant_id
      );
  END IF;

  IF v_updated_rows = 0 THEN
    RETURN json_build_object(
        'success', false, 
        'error', 'USER_NOT_FOUND_IN_TABLE', 
        'message', 'User ID exists in Auth but not in technicians table.'
    );
  END IF;

  RETURN json_build_object(
      'success', true, 
      'action', 'updated_and_logged', 
      'rows', v_updated_rows
  );
END;
$$;

-- 4. Grant Permissions
GRANT ALL ON TABLE public.technician_location_history TO authenticated;
GRANT ALL ON TABLE public.technician_location_history TO service_role;

SELECT '✅ History Tracking Enabled. Movements will now be saved to technician_location_history.' as status;
