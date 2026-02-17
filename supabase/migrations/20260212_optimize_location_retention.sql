-- 🛡️ LOCATION HISTORY RETENTION POLICY (Optimized for Postgres/Supabase)
-- This script adds an automated cleanup to prevent the database from growing infinitely.

-- 1. Create a function to delete old history (e.g., older than 90 days)
CREATE OR REPLACE FUNCTION delete_old_location_history()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete records older than 90 days
  DELETE FROM public.technician_location_history
  WHERE recorded_at < NOW() - INTERVAL '90 days';
  
  -- Vaccum is handled by Supabase automatically, but this keeps the table size managed.
END;
$$;

-- 2. Create a Cron Job (requires pg_cron extension)
-- If pg_cron is not enabled, you can run this manually or use an Edge Function.
-- Check if extension exists first:
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the job to run every day at 3:00 AM
SELECT cron.schedule(
  'cleanup-location-history', -- unique job name
  '0 3 * * *',                -- cron schedule (03:00 AM daily)
  'SELECT delete_old_location_history();'
);

-- 3. Optimization: Ensure Index is efficient
-- BRIN index is better for time-series data that is inserted sequentially (lightweight)
CREATE INDEX IF NOT EXISTS idx_tech_loc_history_brin_date 
ON public.technician_location_history USING BRIN(recorded_at);

-- 4. Safety Monitor
-- Create a view to check storage usage of this table
CREATE OR REPLACE VIEW view_history_storage_size AS
SELECT 
    pg_size_pretty(pg_total_relation_size('public.technician_location_history')) as total_size,
    (SELECT count(*) FROM public.technician_location_history) as row_count;

SELECT '✅ Retention Policy & Optimization Applied. Data older than 90 days will be auto-deleted.' as status;
