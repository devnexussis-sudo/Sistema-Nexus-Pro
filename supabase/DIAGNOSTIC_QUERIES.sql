-- ============================================================================
-- DIAGNOSTIC QUERIES FOR SUPABASE RLS & SECURITY
-- ============================================================================
-- Use these queries to inspect and debug your Supabase security configuration
-- ============================================================================

-- ============================================================================
-- 1. LIST ALL POLICIES
-- ============================================================================

SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd as operation,
  CASE 
    WHEN qual IS NOT NULL THEN 'USING: ' || qual
    ELSE 'No USING clause'
  END as using_clause,
  CASE 
    WHEN with_check IS NOT NULL THEN 'WITH CHECK: ' || with_check
    ELSE 'No WITH CHECK clause'
  END as with_check_clause
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ============================================================================
-- 2. LIST ALL INDEXES
-- ============================================================================

SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes 
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- ============================================================================
-- 3. CHECK IF RLS IS ENABLED
-- ============================================================================

SELECT 
  schemaname,
  tablename,
  CASE 
    WHEN rowsecurity THEN '✅ ENABLED'
    ELSE '❌ DISABLED'
  END as rls_status
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Alternative using pg_class
SELECT 
  n.nspname as schema,
  c.relname as table_name,
  CASE 
    WHEN c.relrowsecurity THEN '✅ ENABLED'
    ELSE '❌ DISABLED'
  END as rls_status,
  CASE 
    WHEN c.relforcerowsecurity THEN '🔒 FORCED (even for table owner)'
    ELSE 'Standard'
  END as rls_mode
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public' 
  AND c.relkind = 'r'
ORDER BY c.relname;

-- ============================================================================
-- 4. LIST ALL FUNCTIONS IN AUTH SCHEMA
-- ============================================================================

SELECT 
  n.nspname as schema,
  p.proname as function_name,
  pg_get_function_result(p.oid) as return_type,
  pg_get_function_arguments(p.oid) as arguments,
  CASE 
    WHEN p.prosecdef THEN '🔒 SECURITY DEFINER'
    ELSE 'SECURITY INVOKER'
  END as security_type,
  CASE 
    WHEN p.provolatile = 'i' THEN 'IMMUTABLE'
    WHEN p.provolatile = 's' THEN 'STABLE'
    ELSE 'VOLATILE'
  END as volatility
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN ('get_user_tenant_id', 'is_admin', 'get_user_organization_id')
ORDER BY p.proname;

-- ============================================================================
-- 5. CHECK FUNCTION PERMISSIONS
-- ============================================================================

SELECT 
  n.nspname as schema,
  p.proname as function_name,
  pg_catalog.pg_get_userbyid(p.proowner) as owner,
  array_to_string(p.proacl, ', ') as acl_permissions
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN ('get_user_tenant_id', 'is_admin', 'get_user_organization_id')
ORDER BY n.nspname, p.proname;

-- ============================================================================
-- 6. LIST ALL TABLES WITH TENANT_ID COLUMN
-- ============================================================================

SELECT 
  table_schema,
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'tenant_id'
ORDER BY table_name;

-- ============================================================================
-- 7. CHECK FOR MISSING INDEXES ON TENANT_ID
-- ============================================================================

-- Tables with tenant_id but no index
SELECT 
  c.table_name,
  'Missing index on tenant_id' as issue,
  'CREATE INDEX idx_' || c.table_name || '_tenant_id ON public.' || c.table_name || '(tenant_id);' as suggested_fix
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.column_name = 'tenant_id'
  AND NOT EXISTS (
    SELECT 1 
    FROM pg_indexes i 
    WHERE i.schemaname = 'public' 
      AND i.tablename = c.table_name 
      AND i.indexdef LIKE '%tenant_id%'
  )
ORDER BY c.table_name;

-- ============================================================================
-- 8. CHECK FOR TABLES WITHOUT RLS POLICIES
-- ============================================================================

-- Tables with RLS enabled but no policies
SELECT 
  t.schemaname,
  t.tablename,
  'RLS enabled but no policies' as warning,
  'This table will block all access!' as impact
FROM pg_tables t
WHERE t.schemaname = 'public'
  AND t.rowsecurity = true
  AND NOT EXISTS (
    SELECT 1 
    FROM pg_policies p 
    WHERE p.schemaname = t.schemaname 
      AND p.tablename = t.tablename
  )
ORDER BY t.tablename;

-- ============================================================================
-- 9. AUDIT LOG STATISTICS
-- ============================================================================

-- Count of audit logs by table
SELECT 
  table_name,
  operation,
  COUNT(*) as log_count,
  MIN(created_at) as first_log,
  MAX(created_at) as last_log
FROM public.audit_logs
GROUP BY table_name, operation
ORDER BY table_name, operation;

-- Recent audit logs (last 24 hours)
SELECT 
  created_at,
  table_name,
  operation,
  user_id,
  tenant_id,
  changed_fields
FROM public.audit_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 100;

-- ============================================================================
-- 10. CHECK CURRENT USER CONTEXT (Run as authenticated user)
-- ============================================================================

-- Get current auth context
SELECT 
  auth.uid() as current_user_id,
  public.get_user_tenant_id() as current_tenant_id,
  public.is_admin() as is_admin_user;

-- Get current JWT claims
SELECT current_setting('request.jwt.claims', true)::json as jwt_claims;

-- Get current user details
SELECT 
  id,
  email,
  tenant_id,
  role,
  name
FROM public.users
WHERE id = auth.uid();

-- ============================================================================
-- 11. PERFORMANCE: SLOW QUERIES
-- ============================================================================

-- Requires pg_stat_statements extension
-- CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

SELECT 
  substring(query, 1, 100) as query_preview,
  calls,
  total_time,
  mean_time,
  max_time,
  stddev_time
FROM pg_stat_statements
WHERE query LIKE '%public.%'
  AND query NOT LIKE '%pg_stat%'
ORDER BY mean_time DESC
LIMIT 20;

-- ============================================================================
-- 12. INDEX USAGE STATISTICS
-- ============================================================================

SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan as times_used,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched,
  CASE 
    WHEN idx_scan = 0 THEN '⚠️ UNUSED INDEX'
    WHEN idx_scan < 100 THEN '⚡ LOW USAGE'
    ELSE '✅ ACTIVE'
  END as usage_status
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- ============================================================================
-- 13. TABLE SIZES
-- ============================================================================

SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as indexes_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- ============================================================================
-- 14. FOREIGN KEY RELATIONSHIPS
-- ============================================================================

SELECT
  tc.table_schema, 
  tc.table_name, 
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  tc.constraint_name
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;

-- ============================================================================
-- 15. CHECK FOR ORPHANED RECORDS (Missing tenant_id)
-- ============================================================================

-- Users without tenant_id
SELECT COUNT(*) as orphaned_users
FROM public.users
WHERE tenant_id IS NULL;

-- Orders without tenant_id
SELECT COUNT(*) as orphaned_orders
FROM public.orders
WHERE tenant_id IS NULL;

-- Customers without tenant_id
SELECT COUNT(*) as orphaned_customers
FROM public.customers
WHERE tenant_id IS NULL;

-- ============================================================================
-- 16. VALIDATE TENANT DATA ISOLATION
-- ============================================================================

-- Count records per tenant
SELECT 
  t.id as tenant_id,
  t.name as tenant_name,
  (SELECT COUNT(*) FROM public.users WHERE tenant_id = t.id) as users_count,
  (SELECT COUNT(*) FROM public.orders WHERE tenant_id = t.id) as orders_count,
  (SELECT COUNT(*) FROM public.customers WHERE tenant_id = t.id) as customers_count,
  (SELECT COUNT(*) FROM public.equipments WHERE tenant_id = t.id) as equipments_count
FROM public.tenants t
ORDER BY t.name;

-- ============================================================================
-- 17. CHECK FOR DUPLICATE POLICIES
-- ============================================================================

SELECT 
  tablename,
  policyname,
  COUNT(*) as duplicate_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename, policyname
HAVING COUNT(*) > 1;

-- ============================================================================
-- 18. SECURITY AUDIT SUMMARY
-- ============================================================================

SELECT 
  'Total Tables' as metric,
  COUNT(*)::text as value
FROM pg_tables
WHERE schemaname = 'public'

UNION ALL

SELECT 
  'Tables with RLS Enabled',
  COUNT(*)::text
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = true

UNION ALL

SELECT 
  'Total Policies',
  COUNT(*)::text
FROM pg_policies
WHERE schemaname = 'public'

UNION ALL

SELECT 
  'Total Indexes',
  COUNT(*)::text
FROM pg_indexes
WHERE schemaname = 'public'

UNION ALL

SELECT 
  'Security Definer Functions',
  COUNT(*)::text
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.prosecdef = true
  AND p.proname IN ('get_user_tenant_id', 'is_admin', 'get_user_organization_id', 'audit_trigger_func');

-- ============================================================================
-- END OF DIAGNOSTIC QUERIES
-- ============================================================================
