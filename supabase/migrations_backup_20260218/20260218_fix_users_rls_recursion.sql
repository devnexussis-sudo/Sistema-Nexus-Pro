-- 🛡️ FIX RLS: Infinite Recursion & Policy Conflicts
-- Este script remove TODAS as variantes de policies antigas antes de recriar as novas.
-- Isso previne o erro "policy already exists" (42710).

BEGIN;

-- 1. Remoção agressiva de policies antigas e em conflito
DROP POLICY IF EXISTS "Users can view open members of their tenant" ON users;
DROP POLICY IF EXISTS "Users can view members of their tenant" ON users; -- Nome conflitante
DROP POLICY IF EXISTS "Admins can manage members" ON users;
DROP POLICY IF EXISTS "Admins can update members" ON users;
DROP POLICY IF EXISTS "Admins can insert members" ON users;
DROP POLICY IF EXISTS "Admins can delete members" ON users;
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON users;

-- 2. Recriação das Policies Otimizadas (Baseadas em Token/Metadata)
-- Leitura (SELECT)
CREATE POLICY "Users can view members of their tenant" ON users
FOR SELECT
USING (
  -- Lê tenantId direto do token (rápido, sem query recursiva)
  ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id)
  OR 
  (auth.uid() = id) -- Usuário sempre vê a si mesmo
);

-- Edição (UPDATE) - Apenas Admin do mesmo tenant
CREATE POLICY "Admins can update members" ON users
FOR UPDATE
USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' 
  AND 
  ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id)
);

-- Inserção (INSERT) - Apenas Admin do mesmo tenant
CREATE POLICY "Admins can insert members" ON users
FOR INSERT
WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' 
  AND 
  ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id)
);

-- Remoção (DELETE) - Apenas Admin do mesmo tenant
CREATE POLICY "Admins can delete members" ON users
FOR DELETE
USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' 
  AND 
  ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id)
);

-- 3. Correção Spillover em User Groups (Garante que também não tenha recursão)
ALTER TABLE user_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View groups of tenant" ON user_groups;
DROP POLICY IF EXISTS "Admins can manage groups" ON user_groups;

CREATE POLICY "View groups of tenant" ON user_groups
FOR SELECT
USING (
  ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id)
);

CREATE POLICY "Admins can manage groups" ON user_groups
FOR ALL
USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' 
  AND 
  ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id)
);

COMMIT;
