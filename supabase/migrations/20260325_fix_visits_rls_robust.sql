-- 🛡️ Nexus Pro - Fix Service Visits RLS
-- Fixes "new row violates row-level security policy for table service_visits"
-- Uses the robust get_auth_tenant_id() function instead of unsafe JWT static access.

BEGIN;

DROP POLICY IF EXISTS "Visits ALL" ON public.service_visits;
DROP POLICY IF EXISTS "Visits SELECT" ON public.service_visits;
DROP POLICY IF EXISTS "visits_all_access_tenant" ON public.service_visits;

CREATE POLICY "visits_all_access_tenant" ON public.service_visits
FOR ALL TO authenticated
USING (tenant_id = get_auth_tenant_id())
WITH CHECK (tenant_id = get_auth_tenant_id());

COMMIT;
