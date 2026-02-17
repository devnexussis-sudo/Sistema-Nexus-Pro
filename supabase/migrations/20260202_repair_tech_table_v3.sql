-- Migration: Repair technicians table and RLS policies (v3 - Fixed missing phone column in users)
-- 1. Ensure RLS is active
ALTER TABLE technicians ENABLE ROW LEVEL SECURITY;

-- 2. Drop old policies to avoid conflicts if they exist
DROP POLICY IF EXISTS "Technicians can update own location" ON technicians;
DROP POLICY IF EXISTS "Technicians can be viewed by same tenant" ON technicians;
DROP POLICY IF EXISTS "Admins can manage technicians in same tenant" ON technicians;
DROP POLICY IF EXISTS "Users can view technicians in same tenant" ON technicians;

-- 3. Create comprehensive policies
-- Technicians can update their OWN location (latitude, longitude, last_seen)
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
-- Removemos a coluna 'phone' do SELECT pois a tabela 'users' não a possui
INSERT INTO technicians (id, name, email, avatar, tenant_id, active)
SELECT u.id, u.name, u.email, u.avatar, u.tenant_id, u.active
FROM public.users u
WHERE u.role = 'TECHNICIAN'
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  avatar = EXCLUDED.avatar,
  tenant_id = EXCLUDED.tenant_id,
  active = EXCLUDED.active;

-- 5. (Opcional) Adicionar coluna phone na tabela users para consistência futura
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='phone') THEN
        ALTER TABLE public.users ADD COLUMN phone TEXT;
    END IF;
END $$;
