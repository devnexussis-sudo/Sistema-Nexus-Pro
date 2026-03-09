-- Migration: Create RPC function for robust location updates
-- bypasses potential RLS blocking for this specific high-frequency action

CREATE OR REPLACE FUNCTION update_tech_location(
  p_lat DOUBLE PRECISION, 
  p_lng DOUBLE PRECISION
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Updates the technician record corresponding to the currently logged in user
  UPDATE technicians
  SET 
    last_latitude = p_lat,
    last_longitude = p_lng,
    last_seen = NOW()
  WHERE id = auth.uid();
  
  -- If no row was updated (maybe tech not in table?), try to sync from users first
  IF NOT FOUND THEN
    INSERT INTO technicians (id, name, email, tenant_id, active, last_latitude, last_longitude, last_seen)
    SELECT 
      id, 
      name, 
      email, 
      tenant_id, 
      active,
      p_lat,
      p_lng,
      NOW()
    FROM users 
    WHERE id = auth.uid();
  END IF;
END;
$$;

-- Grant execution permission to authenticated users
GRANT EXECUTE ON FUNCTION update_tech_location TO authenticated;
