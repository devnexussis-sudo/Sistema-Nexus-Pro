-- Migration: Allow technicians to update their own location
-- Enable RLS if not already enabled (it should be, but let's be sure)
ALTER TABLE technicians ENABLE ROW LEVEL SECURITY;

-- Policy: Technicians can update their own record
-- We check if the auth.uid() matches the technician's id
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'technicians' AND policyname = 'Technicians can update own location'
    ) THEN
        CREATE POLICY "Technicians can update own location" ON technicians
            FOR UPDATE
            USING (auth.uid()::text = id::text)
            WITH CHECK (auth.uid()::text = id::text);
    END IF;
END $$;

-- Policy: Admin can view all technicians in their tenant (already exists usually, but let's ensure)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'technicians' AND policyname = 'Technicians can be viewed by same tenant'
    ) THEN
        CREATE POLICY "Technicians can be viewed by same tenant" ON technicians
            FOR SELECT
            USING (tenant_id = get_current_tenant_id());
    END IF;
END $$;
