-- 🛡️ FIX RLS: NUCLEAR CLEANUP & REPAIR
-- Este script força a remoção de TODAS as policies da tabela users dinamicamente.
-- Use isso se estiver recebendo erros de "policy already exists".

BEGIN;

-- 1. Limpeza Dinâmica (Remove TUDO da tabela users)
DO $$ 
DECLARE 
    r RECORD; 
BEGIN 
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'users') LOOP 
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON users'; 
    END LOOP; 
END $$;

-- 2. Recriação FRESH das Policies (Otimizadas / Sem Recursão)

-- Leitura: Baseada puramente no Token JWT (Zero DB Lookup = Zero Recursão)
CREATE POLICY "users_read_policy" ON users
FOR SELECT
USING (
  (auth.uid() = id) OR -- Próprio usuário
  (
    -- Verifica se o token tem o tenantId correto (tratamento seguro de NULL)
    (auth.jwt() -> 'user_metadata' ->> 'tenantId') IS NOT NULL AND
    ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id)
  )
);

-- Escrita (Admin): Baseada no Token JWT
CREATE POLICY "users_write_policy" ON users
FOR ALL
USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' AND
  (auth.jwt() -> 'user_metadata' ->> 'tenantId') IS NOT NULL AND
  ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id)
);

-- 3. Correção user_groups também
DO $$ 
DECLARE 
    r RECORD; 
BEGIN 
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'user_groups') LOOP 
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON user_groups'; 
    END LOOP; 
END $$;

CREATE POLICY "groups_read_policy" ON user_groups
FOR SELECT
USING (
  (auth.jwt() -> 'user_metadata' ->> 'tenantId') IS NOT NULL AND
  ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id)
);

CREATE POLICY "groups_write_policy" ON user_groups
FOR ALL
USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' AND
  (auth.jwt() -> 'user_metadata' ->> 'tenantId') IS NOT NULL AND
  ((auth.jwt() -> 'user_metadata' ->> 'tenantId')::uuid = tenant_id)
);

COMMIT;
