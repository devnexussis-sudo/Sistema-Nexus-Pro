-- Migration to add metadata and OS configuration to tenants table
-- This allows storing separated address fields (Number, Complement, etc.) as JSONB
-- and also ensures OS prefix/start number columns exist.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS os_prefix TEXT DEFAULT 'OS-';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS os_start_number INTEGER DEFAULT 1000;
