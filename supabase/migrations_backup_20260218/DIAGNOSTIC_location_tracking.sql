-- Diagnostic script to check technician location tracking setup
-- Run this in Supabase SQL Editor to identify issues

-- 1. Check if technicians table exists and has location columns
SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'technicians'
    AND column_name IN ('last_latitude', 'last_longitude', 'last_seen')
ORDER BY column_name;

-- 2. Check if RPC function exists
SELECT 
    routine_name,
    routine_type
FROM information_schema.routines
WHERE routine_name = 'update_tech_location';

-- 3. List all RLS policies on technicians table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'technicians';

-- 4. Check current technician records
SELECT 
    id,
    name,
    email,
    last_latitude,
    last_longitude,
    last_seen,
    active,
    tenant_id
FROM technicians
ORDER BY last_seen DESC NULLS LAST
LIMIT 10;

-- 5. Check if there are users with TECHNICIAN role
SELECT 
    id,
    name,
    email,
    role,
    tenant_id,
    active
FROM users
WHERE role = 'TECHNICIAN'
ORDER BY name;
