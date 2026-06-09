-- ==============================================================================
-- FIX: Recreate vw_tenant_stats to include newly added columns (e.g. max_technicians)
-- PostgreSQL views freeze their columns (t.*) at creation time. This forces a refresh.
-- ==============================================================================

DROP VIEW IF EXISTS public.vw_tenant_stats;

CREATE VIEW public.vw_tenant_stats AS
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

GRANT SELECT ON public.vw_tenant_stats TO anon;
GRANT SELECT ON public.vw_tenant_stats TO authenticated;
GRANT SELECT ON public.vw_tenant_stats TO service_role;

NOTIFY pgrst, 'reload schema';
