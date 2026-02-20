-- 🛡️ Nexus Pro - Calibração Operacional de RLS (V5)
-- Este script libera a escrita para as principais tabelas operacionais do sistema,
-- garantindo que Admins possam gerenciar dados de sua própria empresa.

BEGIN;

-- ---------------------------------------------------------
-- 1. TABELA: quotes (Orçamentos)
-- ---------------------------------------------------------
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quotes_select_policy" ON public.quotes;
DROP POLICY IF EXISTS "quotes_all_policy" ON public.quotes;

-- Permite leitura para usuários autenticados do mesmo tenant
CREATE POLICY "quotes_select_policy" ON public.quotes
FOR SELECT
USING (
  COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'tenantId'),
    (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
  )::uuid = tenant_id
);

-- Permite todas as operações (INSERT, UPDATE, DELETE) para Admins do mesmo tenant
CREATE POLICY "quotes_all_policy" ON public.quotes
FOR ALL
USING (
  (LOWER(auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'moros_admin'))
  AND
  COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'tenantId'),
    (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
  )::uuid = tenant_id
);

-- ---------------------------------------------------------
-- 2. TABELA: orders (Ordens de Serviço)
-- ---------------------------------------------------------
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_select_policy" ON public.orders;
DROP POLICY IF EXISTS "orders_all_policy" ON public.orders;

CREATE POLICY "orders_select_policy" ON public.orders
FOR SELECT
USING (
  COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'tenantId'),
    (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
  )::uuid = tenant_id
);

CREATE POLICY "orders_all_policy" ON public.orders
FOR ALL
USING (
  -- Admins e técnicos podem criar/editar OS do seu tenant (técnicos via App, Admins via Dashboard)
  COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'tenantId'),
    (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
  )::uuid = tenant_id
);

-- ---------------------------------------------------------
-- 3. TABELA: customers (Clientes)
-- ---------------------------------------------------------
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_select_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_all_policy" ON public.customers;

CREATE POLICY "customers_select_policy" ON public.customers
FOR SELECT
USING (
  COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'tenantId'),
    (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
  )::uuid = tenant_id
);

CREATE POLICY "customers_all_policy" ON public.customers
FOR ALL
USING (
  (LOWER(auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'moros_admin'))
  AND
  COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'tenantId'),
    (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
  )::uuid = tenant_id
);

-- ---------------------------------------------------------
-- 4. TABELA: technicians (Técnicos)
-- ---------------------------------------------------------
ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "technicians_select_policy" ON public.technicians;
DROP POLICY IF EXISTS "technicians_all_policy" ON public.technicians;

CREATE POLICY "technicians_select_policy" ON public.technicians
FOR SELECT
USING (
  COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'tenantId'),
    (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
  )::uuid = tenant_id
);

CREATE POLICY "technicians_all_policy" ON public.technicians
FOR ALL
USING (
  (LOWER(auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'moros_admin'))
  AND
  COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'tenantId'),
    (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
  )::uuid = tenant_id
);

COMMIT;
