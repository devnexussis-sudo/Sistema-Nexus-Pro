-- Migration: Repair technicians table and RLS policies
-- 1. Ensure RLS is active
ALTER TABLE technicians ENABLE ROW LEVEL SECURITY;

-- 2. Drop old policies to avoid conflicts if they exist
DROP POLICY IF EXISTS "Technicians can update own location" ON technicians;
DROP POLICY IF EXISTS "Technicians can be viewed by same tenant" ON technicians;
DROP POLICY IF EXISTS "Admins can manage technicians in same tenant" ON technicians;

-- 3. Create comprehensive policies
-- Technicians can update their OWN location
CREATE POLICY "Technicians can update own location" ON technicians
    FOR UPDATE
    USING (auth.uid()::text = id::text)
    WITH CHECK (auth.uid()::text = id::text);

-- Admins can do EVERYTHING with technicians of their tenant
CREATE POLICY "Admins can manage technicians in same tenant" ON technicians
    FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- Users (both techs and admins) in the same tenant can view technicians
CREATE POLICY "Users can view technicians in same tenant" ON technicians
    FOR SELECT
    USING (tenant_id = get_current_tenant_id());

-- 4. Sync existing technicians from 'users' table if they are missing
INSERT INTO technicians (id, name, email, phone, avatar, tenant_id, active)
SELECT id, name, email, phone, avatar, tenant_id, active
FROM users
WHERE role = 'TECHNICIAN'
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  avatar = EXCLUDED.avatar,
  tenant_id = EXCLUDED.tenant_id,
  active = EXCLUDED.active;
