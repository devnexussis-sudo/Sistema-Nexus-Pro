-- 🛡️ NEXUS PRO SECURITY PROTOCOL V2
-- OBJECTIVE: Restore Write Access (INSERT/UPDATE) with Strict Tenant Isolation (JWT-Based)
-- COMPLIANCE: Big Tech Standards (Zero Trust, No Service Role Bypass)

BEGIN;

-- ==================================================================================
-- 1. BASE TABLES (Operacionais) - Permitem escrita colabotativa, Delete restrito
-- Tabelas: customers, orders, quotes, contracts, equipments
-- ==================================================================================

-- >> CUSTOMERS <<
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "view_customers" ON customers;
DROP POLICY IF EXISTS "write_customers" ON customers;
DROP POLICY IF EXISTS "delete_customers" ON customers;
-- Read: Todo usuário autenticado do tenant
CREATE POLICY "view_customers" ON customers FOR SELECT USING (
  (auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id
);
-- Write (Insert/Update): Todo usuário autenticado do tenant (Colaboração)
CREATE POLICY "write_customers" ON customers FOR INSERT WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id
);
CREATE POLICY "modify_customers" ON customers FOR UPDATE USING (
  (auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id
);
-- Delete: Apenas ADMIN
CREATE POLICY "delete_customers" ON customers FOR DELETE USING (
  (auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id
  AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

-- >> ORDERS (Service Orders) <<
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "view_orders" ON orders;
DROP POLICY IF EXISTS "write_orders" ON orders;
DROP POLICY IF EXISTS "delete_orders" ON orders;

CREATE POLICY "view_orders" ON orders FOR SELECT USING (
  ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id)
);
CREATE POLICY "write_orders" ON orders FOR INSERT WITH CHECK (
  ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id)
);
CREATE POLICY "modify_orders" ON orders FOR UPDATE USING (
  ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id)
);
CREATE POLICY "delete_orders" ON orders FOR DELETE USING (
  ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id)
  AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

-- >> QUOTES (Orçamentos) <<
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "policy_quotes_select" ON quotes;
DROP POLICY IF EXISTS "policy_quotes_insert" ON quotes;
DROP POLICY IF EXISTS "policy_quotes_update" ON quotes;
DROP POLICY IF EXISTS "policy_quotes_delete" ON quotes;

CREATE POLICY "policy_quotes_select" ON quotes FOR SELECT USING ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id);
CREATE POLICY "policy_quotes_insert" ON quotes FOR INSERT WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id);
CREATE POLICY "policy_quotes_update" ON quotes FOR UPDATE USING ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id);
CREATE POLICY "policy_quotes_delete" ON quotes FOR DELETE USING ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

-- >> CONTRACTS <<
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "policy_contracts_all" ON contracts;
CREATE POLICY "view_contracts" ON contracts FOR SELECT USING ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id);
CREATE POLICY "write_contracts" ON contracts FOR INSERT WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id);
CREATE POLICY "modify_contracts" ON contracts FOR UPDATE USING ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id);
CREATE POLICY "delete_contracts" ON contracts FOR DELETE USING ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

-- >> EQUIPMENTS <<
ALTER TABLE equipments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "policy_equipments_all" ON equipments;
CREATE POLICY "view_equipments" ON equipments FOR SELECT USING ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id);
CREATE POLICY "write_equipments" ON equipments FOR INSERT WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id);
CREATE POLICY "modify_equipments" ON equipments FOR UPDATE USING ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id);
CREATE POLICY "delete_equipments" ON equipments FOR DELETE USING ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');


-- ==================================================================================
-- 2. INVENTORY (Estoque) - Crítico
-- ==================================================================================
ALTER TABLE stock_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stock_isolation" ON stock_items;

-- Select: Todos
CREATE POLICY "view_stock" ON stock_items FOR SELECT USING ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id);
-- Write: Permitido a todos (Técnicos precisam dar baixa/update quantity). 
-- Idealmente seria via RPC, mas para CRUD liberamos Update.
CREATE POLICY "write_stock" ON stock_items FOR INSERT WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id);
CREATE POLICY "modify_stock" ON stock_items FOR UPDATE USING ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id);
-- Delete: ADMIN ONLY
CREATE POLICY "delete_stock" ON stock_items FOR DELETE USING ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');


-- ==================================================================================
-- 3. SETTINGS & CONFIG (Sensível) - Apenas Admin Escreve
-- Tabelas: form_templates, service_types, activation_rules, technicians
-- ==================================================================================

-- >> FORM TEMPLATES <<
ALTER TABLE form_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "view_forms" ON form_templates;
DROP POLICY IF EXISTS "manage_forms" ON form_templates;

CREATE POLICY "view_forms" ON form_templates FOR SELECT USING ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id);
-- Write/Update/Delete: ADMIN ONLY
CREATE POLICY "manage_forms" ON form_templates FOR ALL USING (
  (auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id
  AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

-- >> SERVICE TYPES <<
ALTER TABLE service_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "view_service_types" ON service_types;
DROP POLICY IF EXISTS "manage_service_types" ON service_types;

CREATE POLICY "view_service_types" ON service_types FOR SELECT USING ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id);
CREATE POLICY "manage_service_types" ON service_types FOR ALL USING (
  (auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id
  AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

-- >> ACTIVATION RULES <<
ALTER TABLE activation_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "view_rules" ON activation_rules;
DROP POLICY IF EXISTS "manage_rules" ON activation_rules;

CREATE POLICY "view_rules" ON activation_rules FOR SELECT USING ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id);
CREATE POLICY "manage_rules" ON activation_rules FOR ALL USING (
  (auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id
  AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

-- >> TECHNICIANS (Gerenciamento de Time) <<
ALTER TABLE technicians ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "view_techs" ON technicians;
DROP POLICY IF EXISTS "manage_techs" ON technicians;

CREATE POLICY "view_techs" ON technicians FOR SELECT USING ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id);
-- Apenas ADMIN pode cadastrar/editar técnicos
CREATE POLICY "manage_techs" ON technicians FOR ALL USING (
  (auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id
  AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

-- Exception: Técnico pode atualizar sua Própria Localização (Se houver tabela separada ou campo na tabela)
-- Se a localização estiver na tabela technicians, precisamos permitir update where id = auth.uid()
CREATE POLICY "tech_self_update" ON technicians FOR UPDATE USING (
  id = auth.uid()
);


COMMIT;
