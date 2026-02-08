# 🔒 NEXUS PRO - ENTERPRISE SECURITY VERIFICATION CHECKLIST

## 📋 Post-Deployment Verification Steps

### Step 1: Verify RLS is Enabled on All Tables

```sql
-- Run this query in Supabase SQL Editor
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;
```

**Expected Result:** All tables should show `rls_enabled = true`

---

### Step 2: List All Active Policies

```sql
-- View all RLS policies
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
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

**Expected Result:** Should see policies for:
- `users_select_policy`, `users_insert_policy`, `users_update_policy`, `users_delete_policy`
- `orders_select_policy`, `orders_insert_policy`, `orders_update_policy`, `orders_delete_policy`
- `customers_select_policy`, `customers_insert_policy`, etc.
- `tenants_select_policy`, `tenants_update_policy`

---

### Step 3: Verify Indexes Exist

```sql
-- List all indexes on public schema
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes 
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
```

**Expected Result:** Should see indexes like:
- `idx_users_tenant_id`
- `idx_orders_tenant_id`
- `idx_customers_tenant_id`
- `idx_equipments_tenant_id`
- etc.

---

### Step 4: Verify Helper Functions Exist

```sql
-- List security definer functions
SELECT 
  n.nspname as schema,
  p.proname as function_name,
  pg_get_function_result(p.oid) as return_type,
  CASE 
    WHEN p.prosecdef THEN 'SECURITY DEFINER'
    ELSE 'SECURITY INVOKER'
  END as security_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'auth'
  AND p.proname IN ('get_user_tenant_id', 'is_admin', 'get_user_organization_id')
ORDER BY p.proname;
```

**Expected Result:** All three functions should exist with `SECURITY DEFINER`

---

### Step 5: Test API Access with cURL/Postman

#### 5.1 Test Unauthenticated Access (Should Fail)

```bash
curl -X GET 'https://gbwkfumodaqbmmiwayhf.supabase.co/rest/v1/users' \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Content-Type: application/json"
```

**Expected Result:** Empty array `[]` or 401/403 error (no data leak)

---

#### 5.2 Test Authenticated Access (Should Succeed with Tenant Filtering)

```bash
# First, get a JWT token by logging in
curl -X POST 'https://gbwkfumodaqbmmiwayhf.supabase.co/auth/v1/token?grant_type=password' \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "your_password"
  }'

# Use the access_token from response
curl -X GET 'https://gbwkfumodaqbmmiwayhf.supabase.co/rest/v1/users' \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Result:** 
- HTTP 200 OK
- JSON array with users from the same tenant only
- No 403/406 errors

---

#### 5.3 Test Cross-Tenant Isolation

```bash
# Try to access a resource from another tenant (should fail)
curl -X GET 'https://gbwkfumodaqbmmiwayhf.supabase.co/rest/v1/orders?tenant_id=eq.DIFFERENT_TENANT_UUID' \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Result:** Empty array `[]` (RLS blocks cross-tenant access)

---

### Step 6: Check Supabase Logs for Errors

1. Go to **Supabase Dashboard** → **Logs** → **Postgres Logs**
2. Filter by last 1 hour
3. Look for:
   - ❌ `permission denied` errors
   - ❌ `policy violation` errors
   - ❌ `row-level security` errors
   - ✅ Should see normal SELECT/INSERT/UPDATE queries

---

### Step 7: Verify JWT Claims

```sql
-- Test helper function with your JWT
SELECT auth.get_user_tenant_id();
SELECT auth.is_admin();
```

**Expected Result:**
- `get_user_tenant_id()` should return a valid UUID
- `is_admin()` should return `true` or `false` based on user role

---

## 🚨 Common Issues & Troubleshooting

### Issue 1: 403 Forbidden on /rest/v1/users

**Cause:** RLS policy too restrictive or JWT missing tenant_id claim

**Fix:**
```sql
-- Check if JWT has metaTenant claim
SELECT current_setting('request.jwt.claims', true)::json;

-- Temporarily test without RLS (DANGER: only for debugging)
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
-- Test API call
-- Re-enable RLS immediately
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
```

---

### Issue 2: 406 Not Acceptable

**Cause:** Missing `Accept` header or content negotiation issue

**Fix:**
```bash
# Add proper headers
curl -X GET 'https://gbwkfumodaqbmmiwayhf.supabase.co/rest/v1/users' \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json"
```

---

### Issue 3: Empty Results When Data Exists

**Cause:** RLS policy filtering out all rows (tenant_id mismatch)

**Fix:**
```sql
-- Check user's tenant_id
SELECT id, email, tenant_id FROM public.users WHERE id = auth.uid();

-- Check if data has matching tenant_id
SELECT COUNT(*) FROM public.orders WHERE tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid());

-- Verify JWT claim
SELECT auth.get_user_tenant_id();
```

---

### Issue 4: HTTP 200 but Error in Body

**Cause:** PostgREST returning error object instead of data

**Fix:**
```sql
-- Check for syntax errors in policies
SELECT * FROM pg_policies WHERE schemaname = 'public' AND policyname LIKE '%error%';

-- Verify function exists and is accessible
SELECT auth.get_user_tenant_id(); -- Should not error
```

---

## 🔐 Security Best Practices Checklist

- [ ] ✅ RLS enabled on all public tables
- [ ] ✅ Helper functions use `SECURITY DEFINER`
- [ ] ✅ `anon` and `authenticated` roles cannot execute helper functions directly
- [ ] ✅ Policies use `auth.uid()` and `auth.get_user_tenant_id()`
- [ ] ✅ Indexes created on `tenant_id`, `user_id`, and frequently queried columns
- [ ] ✅ Audit logging infrastructure in place (optional but recommended)
- [ ] ✅ No service_role key exposed to frontend
- [ ] ✅ JWT contains `metaTenant` or `tenant_id` claim
- [ ] ✅ Cross-tenant access blocked by RLS
- [ ] ✅ Admin users can manage resources in their tenant only

---

## 📊 Performance Monitoring Queries

### Check Slow Queries

```sql
SELECT 
  query,
  calls,
  total_time,
  mean_time,
  max_time
FROM pg_stat_statements
WHERE query LIKE '%public.%'
ORDER BY mean_time DESC
LIMIT 10;
```

### Check Index Usage

```sql
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan as index_scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

---

## 🔄 Rollback Instructions (Emergency Only)

If you need to rollback the security changes:

```sql
-- DANGER: This disables all security. Only use in emergency.

-- Disable RLS on all tables
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants DISABLE ROW LEVEL SECURITY;

-- Drop policies
DROP POLICY IF EXISTS "users_select_policy" ON public.users;
DROP POLICY IF EXISTS "orders_select_policy" ON public.orders;
-- ... (drop all policies)

-- Drop helper functions
DROP FUNCTION IF EXISTS auth.get_user_tenant_id();
DROP FUNCTION IF EXISTS auth.is_admin();
DROP FUNCTION IF EXISTS auth.get_user_organization_id();
```

**⚠️ WARNING:** Only use rollback in development. In production, fix the specific issue instead.

---

## 📝 Notes for Adaptation

### If Column Names Differ:

1. **`tenant_id` → `organization_id`:**
   - Find/Replace `tenant_id` with `organization_id` in the SQL script

2. **`user_id` → `owner_id`:**
   - Update policies to use correct column name

3. **JWT Claim Name:**
   - If your JWT uses `app_metadata.tenant` instead of `metaTenant`:
   ```sql
   -- Update helper function
   CREATE OR REPLACE FUNCTION auth.get_user_tenant_id()
   RETURNS uuid AS $$
   BEGIN
     RETURN (current_setting('request.jwt.claims', true)::json->'app_metadata'->>'tenant')::uuid;
   END;
   $$ LANGUAGE plpgsql SECURITY DEFINER;
   ```

---

## ✅ Final Verification Checklist

Run this final check after deployment:

```sql
-- 1. RLS Status
SELECT COUNT(*) as tables_with_rls 
FROM pg_tables 
WHERE schemaname = 'public' AND rowsecurity = true;

-- 2. Policy Count
SELECT COUNT(*) as total_policies 
FROM pg_policies 
WHERE schemaname = 'public';

-- 3. Index Count
SELECT COUNT(*) as performance_indexes 
FROM pg_indexes 
WHERE schemaname = 'public' AND indexname LIKE 'idx_%';

-- 4. Helper Functions
SELECT COUNT(*) as helper_functions 
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'auth' 
  AND p.proname IN ('get_user_tenant_id', 'is_admin');
```

**Expected Results:**
- `tables_with_rls` ≥ 10
- `total_policies` ≥ 20
- `performance_indexes` ≥ 15
- `helper_functions` = 2

---

## 🎯 Success Criteria

Your deployment is successful when:

1. ✅ All API calls return HTTP 200 (no 403/406)
2. ✅ Users can only see data from their tenant
3. ✅ Cross-tenant access is blocked
4. ✅ No error objects in response body
5. ✅ Performance is acceptable (queries < 100ms)
6. ✅ Audit logs capture sensitive changes (if enabled)

---

**🚀 Deployment Complete!** Your Supabase database is now aligned to enterprise SaaS security standards.
