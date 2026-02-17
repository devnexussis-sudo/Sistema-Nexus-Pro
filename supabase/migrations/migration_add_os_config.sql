-- 1. Add OS Configuration columns to tenants table
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS os_prefix TEXT DEFAULT 'OS-';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS os_start_number BIGINT DEFAULT 1000;

-- 2. Update existing rows if needed (Optional)
-- UPDATE tenants SET os_prefix = 'OS-', os_start_number = 1000 WHERE os_prefix IS NULL;
