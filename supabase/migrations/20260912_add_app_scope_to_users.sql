-- Fix: Add app_scope to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS app_scope text DEFAULT 'WEB';

-- Force Supabase cache reload
NOTIFY pgrst, 'reload schema';
