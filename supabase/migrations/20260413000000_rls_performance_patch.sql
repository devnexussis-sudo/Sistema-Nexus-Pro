-- 🚀 Nexus Pro - RLS InitPlan & Perf Patch (Fase 1 e 2)
-- Objetivo: Otimizar RLS aplicando InitPlans para evitar reavaliação linear em queries extensivas
-- Adicionando índices não-bloqueantes para chaves estrangeiras cruciais.

BEGIN;

-- ----------------------------------------------------
-- FASE 1: Isolamento Escalar (InitPlans)
-- ----------------------------------------------------

-- Table: public.service_visits
-- Original: 20260325_fix_visits_rls_robust
DROP POLICY IF EXISTS "visits_all_access_tenant" ON public.service_visits;
CREATE POLICY "visits_all_access_tenant" ON public.service_visits
FOR ALL TO authenticated
USING (tenant_id = (SELECT public.get_auth_tenant_id()))
WITH CHECK (tenant_id = (SELECT public.get_auth_tenant_id()));


-- Table: public.orders
-- Original: 20260301_write_policies / 20260405_fix_public_header_rls
DROP POLICY IF EXISTS "orders_all_access_tenant" ON public.orders;
CREATE POLICY "orders_all_access_tenant" ON public.orders
FOR ALL TO authenticated
USING (tenant_id = (SELECT public.get_auth_tenant_id()))
WITH CHECK (tenant_id = (SELECT public.get_auth_tenant_id()));

-- Mantemos acesso público intacto
DROP POLICY IF EXISTS "orders_public_read" ON public.orders;
CREATE POLICY "orders_public_read" ON public.orders
FOR SELECT TO anon
USING (display_id IS NOT NULL);


-- Table: public.technicians
-- Original: 20260301_write_policies / 20260405_fix_public_header_rls
DROP POLICY IF EXISTS "technicians_all_access_tenant" ON public.technicians;
CREATE POLICY "technicians_all_access_tenant" ON public.technicians
FOR ALL TO authenticated
USING (tenant_id = (SELECT public.get_auth_tenant_id()))
WITH CHECK (tenant_id = (SELECT public.get_auth_tenant_id()));

-- Mantemos acesso público intacto
DROP POLICY IF EXISTS "technicians_public_read" ON public.technicians;
CREATE POLICY "technicians_public_read" ON public.technicians
FOR SELECT TO anon
USING (true);


-- Table: public.customers
-- Original: 20260219_fix_operational_rls
DROP POLICY IF EXISTS "customers_select_policy" ON public.customers;
CREATE POLICY "customers_select_policy" ON public.customers
FOR SELECT
USING (
  tenant_id = (SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'tenantId'),
    (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
  )::uuid)
);

DROP POLICY IF EXISTS "customers_all_policy" ON public.customers;
CREATE POLICY "customers_all_policy" ON public.customers
FOR ALL
USING (
  (SELECT LOWER(auth.jwt() -> 'user_metadata' ->> 'role')) IN ('admin', 'moros_admin')
  AND
  tenant_id = (SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'tenantId'),
    (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
  )::uuid)
);


-- Table: public.users
-- Original: 20260301_write_policies
DROP POLICY IF EXISTS "users_all_access_tenant" ON public.users;
CREATE POLICY "users_all_access_tenant" ON public.users
FOR ALL TO authenticated
USING (id = (SELECT auth.uid()) OR tenant_id = (SELECT public.get_auth_tenant_id()))
WITH CHECK (id = (SELECT auth.uid()) OR (tenant_id = (SELECT public.get_auth_tenant_id()) AND (SELECT public.has_permission('ADMIN'))));


-- Table: public.technician_gps_pings
-- Original: 20260308_optimized_gps_pings
DROP POLICY IF EXISTS "Allow technician insert" ON public.technician_gps_pings;
CREATE POLICY "Allow technician insert" ON public.technician_gps_pings
    FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = technician_id);

DROP POLICY IF EXISTS "Admins can see gps pings" ON public.technician_gps_pings;
CREATE POLICY "Admins can see gps pings" ON public.technician_gps_pings
    FOR SELECT TO authenticated USING (
        (SELECT auth.uid()) = technician_id OR 
        EXISTS (SELECT 1 FROM public.users WHERE id = (SELECT auth.uid()) AND role IN ('ADMIN', 'MANAGER', 'OPERATOR'))
    );

-- ----------------------------------------------------
-- FASE 2: Criação de Índices Baseados em Chaves Estrangeiras (Custo/Leitura)
-- NOTA: Como as migrações rodam dentro de blocos transacionais (BEGIN/COMMIT),
-- não usamos "CONCURRENTLY" aqui no script, mas usamos "IF NOT EXISTS" para idempontência.
-- ----------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_service_visits_order_id ON public.service_visits(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_to ON public.orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tech_gps_tech_id ON public.technician_gps_pings(technician_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_id ON public.orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_id ON public.customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quotes_tenant_id ON public.quotes(tenant_id);

COMMIT;
