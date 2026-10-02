-- ==============================================================================
-- FIX: Master Admin Panel - Create view + Allow reading all tenants
-- ==============================================================================

-- 1. CREATE the stats view (it never existed in the DB)
CREATE OR REPLACE VIEW public.vw_tenant_stats AS
SELECT 
    t.*,
    COALESCE(u_stats.total_users, 0) as user_count,
    COALESCE(u_stats.active_techs, 0) as active_techs,
    COALESCE(o_stats.total_orders, 0) as os_count,
    COALESCE(e_stats.total_equipments, 0) as equipment_count
FROM public.tenants t
LEFT JOIN (
    SELECT 
        tenant_id, 
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE role = 'TECHNICIAN') as active_techs
    FROM public.users
    GROUP BY tenant_id
) u_stats ON t.id = u_stats.tenant_id
LEFT JOIN (
    SELECT 
        tenant_id, 
        COUNT(*) as total_orders
    FROM public.orders
    GROUP BY tenant_id
) o_stats ON t.id = o_stats.tenant_id
LEFT JOIN (
    SELECT 
        tenant_id, 
        COUNT(*) as total_equipments
    FROM public.equipments
    GROUP BY tenant_id
) e_stats ON t.id = e_stats.tenant_id;

-- 2. Grant read access to the view
GRANT SELECT ON public.vw_tenant_stats TO anon;
GRANT SELECT ON public.vw_tenant_stats TO authenticated;
GRANT SELECT ON public.vw_tenant_stats TO service_role;

-- 3. Permissive policies on tenants table for Master Admin (anon)
DROP POLICY IF EXISTS "tenants_anon_read" ON public.tenants;
CREATE POLICY "tenants_anon_read" ON public.tenants
    FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "tenants_anon_insert" ON public.tenants;
CREATE POLICY "tenants_anon_insert" ON public.tenants
    FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "tenants_anon_update" ON public.tenants;
CREATE POLICY "tenants_anon_update" ON public.tenants
    FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tenants_anon_delete" ON public.tenants;
CREATE POLICY "tenants_anon_delete" ON public.tenants
    FOR DELETE TO anon USING (true);

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
