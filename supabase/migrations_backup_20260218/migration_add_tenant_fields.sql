-- Migration to add missing fields to tenants table
-- This ensures that the fields sent by SettingsPage and SuperAdminPage exist in the database

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trading_name TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cnpj TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS admin_email TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS state_registration TEXT DEFAULT 'ISENTO';

-- Sync existing data for fallback compatibility
UPDATE tenants SET company_name = name WHERE company_name IS NULL;
UPDATE tenants SET cnpj = document WHERE cnpj IS NULL;
UPDATE tenants SET admin_email = email WHERE admin_email IS NULL;

-- Ensure RLS is still properly configured (though we use adminSupabase for updates now)
-- We add an UPDATE policy just in case someone wants to allow RLS-based updates in the future
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'tenants' AND policyname = 'Users can update own tenant'
    ) THEN
        CREATE POLICY "Users can update own tenant" ON tenants
            FOR UPDATE
            USING (id = get_current_tenant_id());
    END IF;
END $$;
